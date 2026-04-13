from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.schemas.attendance import (
    AttendanceDeleteRequest,
    AttendanceDeleteResponse,
    AttendanceMarkRequest,
    AttendanceMarkResponse,
    AttendanceRecordRead,
    AttendanceUpdateRequest,
)
from app.services.attendance_service import (
    build_csv_export,
    delete_attendance,
    list_attendance_by_date,
    mark_attendance,
    update_attendance,
)


router = APIRouter(prefix="/attendance", tags=["attendance"])


@router.post("/mark", response_model=AttendanceMarkResponse)
def save_attendance(payload: AttendanceMarkRequest, db: Session = Depends(get_db)) -> AttendanceMarkResponse:
    try:
        return mark_attendance(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("", response_model=list[AttendanceRecordRead])
def get_attendance(date: date = Query(...), db: Session = Depends(get_db)) -> list[AttendanceRecordRead]:
    return list_attendance_by_date(db, date)


@router.put("/update", response_model=AttendanceRecordRead)
def update_attendance_status(
    payload: AttendanceUpdateRequest, db: Session = Depends(get_db)
) -> AttendanceRecordRead:
    try:
        return update_attendance(db, payload)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete("/delete", response_model=AttendanceDeleteResponse)
def remove_attendance_record(
    payload: AttendanceDeleteRequest, db: Session = Depends(get_db)
) -> AttendanceDeleteResponse:
    try:
        delete_attendance(db, payload)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return AttendanceDeleteResponse(
        message="Attendance record deleted successfully.",
        roll_number=payload.roll_number,
        date=payload.date,
    )


@router.get("/export")
def export_attendance(date: date = Query(...), db: Session = Depends(get_db)) -> Response:
    csv_content = build_csv_export(db, date)
    filename = f"attendance-{date.isoformat()}.csv"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return Response(content=csv_content, media_type="text/csv", headers=headers)
