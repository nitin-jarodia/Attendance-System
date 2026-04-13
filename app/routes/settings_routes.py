from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth.dependencies import require_admin
from app.db.database import get_db
from app.models.user import User
from app.schemas.settings import (
    ActivityLogResponse,
    ResetAllRequest,
    ResetDayRequest,
    ResetResponse,
    UndoResetRequest,
)
from app.services.settings_service import (
    get_activity_log,
    reset_all_attendance,
    reset_attendance_for_date,
    undo_reset,
)


router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/activity-log", response_model=ActivityLogResponse)
def activity_log(
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> ActivityLogResponse:
    return get_activity_log(db, limit=limit)


@router.post("/reset/day", response_model=ResetResponse)
def reset_day(
    payload: ResetDayRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> ResetResponse:
    return reset_attendance_for_date(db, actor=current_user, target_date=payload.target_date)


@router.post("/reset/today", response_model=ResetResponse)
def reset_today(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> ResetResponse:
    return reset_attendance_for_date(db, actor=current_user, target_date=date.today())


@router.post("/reset/all", response_model=ResetResponse)
def reset_all(
    payload: ResetAllRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> ResetResponse:
    try:
        return reset_all_attendance(db, actor=current_user, confirmation_text=payload.confirmation_text)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/reset/undo", response_model=ResetResponse)
def undo_last_reset(
    payload: UndoResetRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> ResetResponse:
    try:
        return undo_reset(db, actor=current_user, snapshot_id=payload.snapshot_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
