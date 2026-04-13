from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user, require_teacher_or_admin
from app.db.database import get_db
from app.models.student import Student
from app.models.user import User
from app.realtime.manager import attendance_realtime_manager
from app.schemas.attendance import (
    AttendanceDeleteRequest,
    AttendanceDeleteResponse,
    AttendanceMarkRequest,
    AttendanceMarkResponse,
    AttendanceRecordRead,
    AttendanceSearchResponse,
    AttendanceStatus,
    AttendanceUpdateRequest,
    LateArrivalsResponse,
)
from app.services.activity_service import log_activity
from app.services.attendance_service import (
    build_csv_export,
    delete_attendance,
    get_late_arrivals,
    list_attendance_by_date,
    mark_attendance,
    search_attendance,
    update_attendance,
)


router = APIRouter(prefix="/attendance", tags=["attendance"])


@router.post("/mark", response_model=AttendanceMarkResponse)
async def save_attendance(
    payload: AttendanceMarkRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher_or_admin),
) -> AttendanceMarkResponse:
    try:
        response = mark_attendance(db, payload, current_user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc

    status_counts = {}
    for r in payload.records:
        status_counts[r.status.value] = status_counts.get(r.status.value, 0) + 1
    summary_parts = [f"{count} {s}" for s, count in status_counts.items()]

    log_activity(
        db,
        action_type="ATTENDANCE_MARKED",
        user=current_user,
        details=f"Marked attendance for {payload.date.isoformat()}: {', '.join(summary_parts)}",
        target_type="attendance",
        target_name=payload.date.isoformat(),
    )
    db.commit()

    changed_roll_numbers = [record.roll_number for record in payload.records]
    class_ids = list(
        db.scalars(select(Student.class_id).where(Student.roll_number.in_(changed_roll_numbers))).all()
    )
    await attendance_realtime_manager.emit_attendance_event(
        action="mark",
        attendance_date=response.date,
        class_ids=class_ids,
        roll_numbers=changed_roll_numbers,
        message=f"Attendance saved for {response.date.isoformat()}.",
    )
    return response


@router.get("", response_model=list[AttendanceRecordRead])
def get_attendance(
    date: date = Query(...),
    class_id: int | None = Query(default=None, gt=0),
    status_filter: AttendanceStatus | None = Query(default=None, alias="status"),
    search: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[AttendanceRecordRead]:
    try:
        return list_attendance_by_date(
            db,
            date,
            current_user=current_user,
            class_id=class_id,
            status=status_filter,
            search=search,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.get("/search", response_model=AttendanceSearchResponse)
def search_attendance_route(
    date_filter: date | None = Query(default=None, alias="date"),
    class_id: int | None = Query(default=None, gt=0),
    status_filter: AttendanceStatus | None = Query(default=None, alias="status"),
    search: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AttendanceSearchResponse:
    try:
        return search_attendance(
            db,
            current_user=current_user,
            attendance_date=date_filter,
            class_id=class_id,
            status=status_filter,
            search=search,
            page=page,
            page_size=page_size,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.put("/update", response_model=AttendanceRecordRead)
async def update_attendance_status(
    payload: AttendanceUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher_or_admin),
) -> AttendanceRecordRead:
    try:
        record = update_attendance(db, payload, current_user)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    if record.previous_status and record.previous_status != record.status.value:
        log_activity(
            db,
            action_type="ATTENDANCE_CHANGED",
            user=current_user,
            details=f"Changed attendance for roll {record.roll_number} on {record.date.isoformat()}",
            target_type="student",
            target_id=record.roll_number,
            target_name=record.name,
            previous_value=record.previous_status,
            new_value=record.status.value,
        )
        db.commit()

    await attendance_realtime_manager.emit_attendance_event(
        action="update",
        attendance_date=record.date,
        class_ids=[record.class_id],
        roll_numbers=[record.roll_number],
        message=f"Attendance updated for roll {record.roll_number}.",
    )
    return record


@router.delete("/delete", response_model=AttendanceDeleteResponse)
async def remove_attendance_record(
    payload: AttendanceDeleteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher_or_admin),
) -> AttendanceDeleteResponse:
    try:
        deleted_record = delete_attendance(db, payload, current_user)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    log_activity(
        db,
        action_type="ATTENDANCE_CHANGED",
        user=current_user,
        details=f"Deleted attendance for roll {payload.roll_number} on {payload.date.isoformat()}",
        target_type="student",
        target_id=payload.roll_number,
        target_name=deleted_record.name,
        previous_value=deleted_record.status.value,
        new_value="deleted",
    )
    db.commit()

    await attendance_realtime_manager.emit_attendance_event(
        action="delete",
        attendance_date=payload.date,
        class_ids=[deleted_record.class_id],
        roll_numbers=[payload.roll_number],
        message=f"Attendance deleted for roll {payload.roll_number}.",
    )

    return AttendanceDeleteResponse(
        message="Attendance record deleted successfully.",
        roll_number=payload.roll_number,
        date=payload.date,
    )


@router.get("/late-arrivals", response_model=LateArrivalsResponse)
def late_arrivals(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    class_id: int | None = Query(default=None, gt=0),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> LateArrivalsResponse:
    try:
        return get_late_arrivals(
            db,
            current_user,
            start_date=start_date,
            end_date=end_date,
            class_id=class_id,
            page=page,
            page_size=page_size,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.get("/export")
def export_attendance(
    date: date = Query(...),
    class_id: int | None = Query(default=None, gt=0),
    status_filter: AttendanceStatus | None = Query(default=None, alias="status"),
    search: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    csv_content = build_csv_export(
        db,
        date,
        current_user=current_user,
        class_id=class_id,
        status=status_filter,
        search=search,
    )

    log_activity(
        db,
        action_type="EXPORT_GENERATED",
        user=current_user,
        details=f"Exported attendance CSV for {date.isoformat()}",
        target_type="attendance",
        target_name=date.isoformat(),
    )
    db.commit()

    filename = f"attendance-{date.isoformat()}.csv"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return Response(content=csv_content, media_type="text/csv", headers=headers)
