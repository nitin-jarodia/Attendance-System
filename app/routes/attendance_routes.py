from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user, require_teacher_or_admin
from app.db.database import get_db
from app.models.user import User
from app.schemas.attendance import (
    AttendanceDeleteRequest,
    AttendanceDeleteResponse,
    AttendanceMarkRequest,
    AttendanceMarkResponse,
    AttendanceRecordRead,
    AttendanceSearchResponse,
    AttendanceStatus,
    AttendanceUpdateRequest,
)
from app.services.attendance_service import (
    build_csv_export,
    delete_attendance,
    list_attendance_by_date,
    mark_attendance,
    search_attendance,
    update_attendance,
)


router = APIRouter(prefix="/attendance", tags=["attendance"])


@router.post("/mark", response_model=AttendanceMarkResponse)
def save_attendance(
    payload: AttendanceMarkRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher_or_admin),
) -> AttendanceMarkResponse:
    try:
        return mark_attendance(db, payload, current_user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.get("", response_model=list[AttendanceRecordRead])
def get_attendance(
    date: date = Query(...),
    class_id: int | None = Query(default=None, gt=0),
    status_filter: AttendanceStatus | None = Query(default=None, alias="status"),
    search: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher_or_admin),
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
    current_user: User = Depends(require_teacher_or_admin),
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
def update_attendance_status(
    payload: AttendanceUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher_or_admin),
) -> AttendanceRecordRead:
    try:
        return update_attendance(db, payload, current_user)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete("/delete", response_model=AttendanceDeleteResponse)
def remove_attendance_record(
    payload: AttendanceDeleteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher_or_admin),
) -> AttendanceDeleteResponse:
    try:
        delete_attendance(db, payload, current_user)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return AttendanceDeleteResponse(
        message="Attendance record deleted successfully.",
        roll_number=payload.roll_number,
        date=payload.date,
    )


@router.get("/export")
def export_attendance(
    date: date = Query(...),
    class_id: int | None = Query(default=None, gt=0),
    status_filter: AttendanceStatus | None = Query(default=None, alias="status"),
    search: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher_or_admin),
) -> Response:
    csv_content = build_csv_export(
        db,
        date,
        current_user=current_user,
        class_id=class_id,
        status=status_filter,
        search=search,
    )
    filename = f"attendance-{date.isoformat()}.csv"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return Response(content=csv_content, media_type="text/csv", headers=headers)
