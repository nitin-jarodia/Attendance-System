from datetime import date, datetime

from pydantic import BaseModel, Field


class HolidayCreate(BaseModel):
    date: date
    name: str = Field(min_length=1, max_length=100)
    type: str = Field(default="national", max_length=30)
    is_recurring: bool = False


class HolidayRead(BaseModel):
    id: int
    date: date
    name: str
    type: str
    is_recurring: bool
    academic_year: str | None = None
    created_at: datetime


class HolidayListResponse(BaseModel):
    items: list[HolidayRead]


class AcademicYearCreate(BaseModel):
    year_label: str = Field(min_length=4, max_length=10)
    start_date: date
    end_date: date
    weekends: str = "saturday,sunday"


class AcademicYearRead(BaseModel):
    id: int
    year_label: str
    start_date: date
    end_date: date
    is_active: bool
    weekends: str


class CalendarDayRead(BaseModel):
    date: date
    day_type: str  # working, holiday, weekend, exam_day, half_day
    holiday_name: str | None = None
    holiday_type: str | None = None
    is_today: bool = False


class CalendarMonthResponse(BaseModel):
    year: int
    month: int
    days: list[CalendarDayRead]
    academic_year: AcademicYearRead | None = None


class UpcomingHolidayRead(BaseModel):
    date: date
    name: str
    type: str
    days_until: int


class WorkingDaysInfo(BaseModel):
    total_calendar_days: int
    total_holidays: int
    total_weekends: int
    total_working_days: int
    start_date: date
    end_date: date
