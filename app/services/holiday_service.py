import calendar
from datetime import date, timedelta

from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.models.holiday import AcademicYearSettings, Holiday
from app.models.user import User
from app.schemas.holiday import (
    AcademicYearCreate,
    AcademicYearRead,
    CalendarDayRead,
    CalendarMonthResponse,
    HolidayCreate,
    HolidayListResponse,
    HolidayRead,
    UpcomingHolidayRead,
    WorkingDaysInfo,
)

INDIAN_NATIONAL_HOLIDAYS = [
    (1, 26, "Republic Day", "national"),
    (3, 14, "Holi", "religious"),
    (4, 14, "Ambedkar Jayanti", "national"),
    (5, 1, "May Day", "national"),
    (8, 15, "Independence Day", "national"),
    (10, 2, "Gandhi Jayanti", "national"),
    (11, 1, "Diwali", "religious"),
    (12, 25, "Christmas", "religious"),
]


def _get_active_academic_year(db: Session) -> AcademicYearSettings | None:
    return db.scalar(
        select(AcademicYearSettings).where(AcademicYearSettings.is_active == True).limit(1)  # noqa: E712
    )


def _parse_weekends(weekends_str: str) -> set[int]:
    day_map = {
        "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
        "friday": 4, "saturday": 5, "sunday": 6,
    }
    return {day_map[d.strip().lower()] for d in weekends_str.split(",") if d.strip().lower() in day_map}


def get_working_days_count(db: Session, start: date, end: date) -> WorkingDaysInfo:
    """Compute working days between start and end, excluding holidays and weekends."""
    academic_year = _get_active_academic_year(db)
    weekend_days = _parse_weekends(academic_year.weekends if academic_year else "saturday,sunday")

    holidays = set(
        db.scalars(
            select(Holiday.date).where(
                Holiday.date >= start,
                Holiday.date <= end,
            )
        ).all()
    )

    total_calendar_days = 0
    total_weekends = 0
    total_holidays = 0
    current = start
    while current <= end:
        total_calendar_days += 1
        if current.weekday() in weekend_days:
            total_weekends += 1
        elif current in holidays:
            total_holidays += 1
        current += timedelta(days=1)

    working = total_calendar_days - total_weekends - total_holidays
    return WorkingDaysInfo(
        total_calendar_days=total_calendar_days,
        total_holidays=total_holidays,
        total_weekends=total_weekends,
        total_working_days=max(working, 0),
        start_date=start,
        end_date=end,
    )


def list_holidays(
    db: Session,
    *,
    year: int | None = None,
    month: int | None = None,
) -> HolidayListResponse:
    filters = []
    if year and month:
        first_day = date(year, month, 1)
        last_day = date(year, month, calendar.monthrange(year, month)[1])
        filters.append(Holiday.date >= first_day)
        filters.append(Holiday.date <= last_day)
    elif year:
        filters.append(Holiday.date >= date(year, 1, 1))
        filters.append(Holiday.date <= date(year, 12, 31))

    rows = list(
        db.scalars(
            select(Holiday).where(*filters).order_by(Holiday.date.asc())
        ).all()
    )
    return HolidayListResponse(
        items=[
            HolidayRead(
                id=h.id,
                date=h.date,
                name=h.name,
                type=h.type,
                is_recurring=h.is_recurring,
                academic_year=h.academic_year,
                created_at=h.created_at,
            )
            for h in rows
        ]
    )


def create_holiday(db: Session, payload: HolidayCreate, user: User) -> HolidayRead:
    academic_year = _get_active_academic_year(db)
    holiday = Holiday(
        date=payload.date,
        name=payload.name,
        type=payload.type,
        is_recurring=payload.is_recurring,
        academic_year=academic_year.year_label if academic_year else None,
        created_by=user.id,
    )
    db.add(holiday)
    db.commit()
    db.refresh(holiday)
    return HolidayRead(
        id=holiday.id,
        date=holiday.date,
        name=holiday.name,
        type=holiday.type,
        is_recurring=holiday.is_recurring,
        academic_year=holiday.academic_year,
        created_at=holiday.created_at,
    )


def delete_holiday(db: Session, holiday_id: int) -> None:
    holiday = db.scalar(select(Holiday).where(Holiday.id == holiday_id))
    if not holiday:
        raise LookupError("Holiday not found.")
    db.delete(holiday)
    db.commit()


def get_calendar_month(db: Session, year: int, month: int) -> CalendarMonthResponse:
    academic_year = _get_active_academic_year(db)
    weekend_days = _parse_weekends(academic_year.weekends if academic_year else "saturday,sunday")

    first_day = date(year, month, 1)
    last_day = date(year, month, calendar.monthrange(year, month)[1])
    today = date.today()

    holidays_map: dict[date, Holiday] = {}
    for h in db.scalars(
        select(Holiday).where(Holiday.date >= first_day, Holiday.date <= last_day)
    ).all():
        holidays_map[h.date] = h

    days: list[CalendarDayRead] = []
    current = first_day
    while current <= last_day:
        if current in holidays_map:
            h = holidays_map[current]
            day_type = h.type if h.type in ("exam_day", "half_day") else "holiday"
            days.append(CalendarDayRead(
                date=current,
                day_type=day_type,
                holiday_name=h.name,
                holiday_type=h.type,
                is_today=current == today,
            ))
        elif current.weekday() in weekend_days:
            days.append(CalendarDayRead(date=current, day_type="weekend", is_today=current == today))
        else:
            days.append(CalendarDayRead(date=current, day_type="working", is_today=current == today))
        current += timedelta(days=1)

    ay_read = None
    if academic_year:
        ay_read = AcademicYearRead(
            id=academic_year.id,
            year_label=academic_year.year_label,
            start_date=academic_year.start_date,
            end_date=academic_year.end_date,
            is_active=academic_year.is_active,
            weekends=academic_year.weekends,
        )

    return CalendarMonthResponse(year=year, month=month, days=days, academic_year=ay_read)


def get_upcoming_holidays(db: Session, *, limit: int = 3) -> list[UpcomingHolidayRead]:
    today = date.today()
    rows = list(
        db.scalars(
            select(Holiday)
            .where(Holiday.date >= today)
            .order_by(Holiday.date.asc())
            .limit(limit)
        ).all()
    )
    return [
        UpcomingHolidayRead(
            date=h.date,
            name=h.name,
            type=h.type,
            days_until=(h.date - today).days,
        )
        for h in rows
    ]


def create_academic_year(db: Session, payload: AcademicYearCreate) -> AcademicYearRead:
    ay = AcademicYearSettings(
        year_label=payload.year_label,
        start_date=payload.start_date,
        end_date=payload.end_date,
        weekends=payload.weekends,
    )
    db.add(ay)
    db.commit()
    db.refresh(ay)
    return AcademicYearRead(
        id=ay.id,
        year_label=ay.year_label,
        start_date=ay.start_date,
        end_date=ay.end_date,
        is_active=ay.is_active,
        weekends=ay.weekends,
    )


def load_preset_holidays(db: Session, user: User, academic_year_label: str) -> int:
    """Load Indian national holidays for the given academic year. Returns count added."""
    today = date.today()
    year = today.year
    count = 0
    for month, day, name, htype in INDIAN_NATIONAL_HOLIDAYS:
        holiday_date = date(year, month, day)
        existing = db.scalar(
            select(Holiday).where(Holiday.date == holiday_date, Holiday.name == name)
        )
        if existing:
            continue
        db.add(Holiday(
            date=holiday_date,
            name=name,
            type=htype,
            is_recurring=True,
            academic_year=academic_year_label,
            created_by=user.id,
        ))
        count += 1
    db.commit()
    return count


def get_active_academic_year(db: Session) -> AcademicYearRead | None:
    ay = _get_active_academic_year(db)
    if not ay:
        return None
    return AcademicYearRead(
        id=ay.id,
        year_label=ay.year_label,
        start_date=ay.start_date,
        end_date=ay.end_date,
        is_active=ay.is_active,
        weekends=ay.weekends,
    )
