from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user, require_admin
from app.db.database import get_db
from app.models.user import User
from app.schemas.holiday import (
    AcademicYearCreate,
    AcademicYearRead,
    CalendarMonthResponse,
    HolidayCreate,
    HolidayListResponse,
    HolidayRead,
    UpcomingHolidayRead,
    WorkingDaysInfo,
)
from app.services.activity_service import log_activity
from app.services.holiday_service import (
    create_academic_year,
    create_holiday,
    delete_holiday,
    get_active_academic_year,
    get_calendar_month,
    get_upcoming_holidays,
    get_working_days_count,
    list_holidays,
    load_preset_holidays,
)


router = APIRouter(prefix="/holidays", tags=["holidays"])


@router.get("", response_model=HolidayListResponse)
def get_holidays(
    year: int | None = Query(default=None),
    month: int | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> HolidayListResponse:
    return list_holidays(db, year=year, month=month)


@router.post("", response_model=HolidayRead, status_code=201)
def add_holiday(
    payload: HolidayCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> HolidayRead:
    result = create_holiday(db, payload, current_user)
    log_activity(
        db,
        action_type="SETTINGS_CHANGED",
        user=current_user,
        details=f"Added holiday: {payload.name} on {payload.date.isoformat()}",
        target_type="holiday",
        target_name=payload.name,
    )
    db.commit()
    return result


@router.delete("/{holiday_id}")
def remove_holiday(
    holiday_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> dict:
    try:
        delete_holiday(db, holiday_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    log_activity(
        db,
        action_type="SETTINGS_CHANGED",
        user=current_user,
        details=f"Removed holiday #{holiday_id}",
        target_type="holiday",
        target_id=holiday_id,
    )
    db.commit()
    return {"message": "Holiday removed."}


@router.get("/calendar", response_model=CalendarMonthResponse)
def calendar_month(
    year: int = Query(default=None),
    month: int = Query(default=None, ge=1, le=12),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> CalendarMonthResponse:
    today = date.today()
    return get_calendar_month(db, year or today.year, month or today.month)


@router.get("/upcoming", response_model=list[UpcomingHolidayRead])
def upcoming_holidays(
    limit: int = Query(default=3, ge=1, le=10),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[UpcomingHolidayRead]:
    return get_upcoming_holidays(db, limit=limit)


@router.get("/working-days", response_model=WorkingDaysInfo)
def working_days(
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> WorkingDaysInfo:
    return get_working_days_count(db, start_date, end_date)


@router.post("/academic-year", response_model=AcademicYearRead, status_code=201)
def add_academic_year(
    payload: AcademicYearCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> AcademicYearRead:
    return create_academic_year(db, payload)


@router.get("/academic-year", response_model=AcademicYearRead | None)
def get_academic_year_route(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> AcademicYearRead | None:
    return get_active_academic_year(db)


@router.post("/load-presets")
def load_presets(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> dict:
    ay = get_active_academic_year(db)
    label = ay.year_label if ay else str(date.today().year)
    count = load_preset_holidays(db, current_user, label)
    if count:
        log_activity(
            db,
            action_type="SETTINGS_CHANGED",
            user=current_user,
            details=f"Loaded {count} preset holidays for {label}",
            target_type="holiday",
        )
        db.commit()
    return {"message": f"Loaded {count} preset holidays.", "count": count}
