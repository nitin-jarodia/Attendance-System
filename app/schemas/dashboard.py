from datetime import date, datetime

from pydantic import BaseModel


class RecentActivityRead(BaseModel):
    attendance_date: date
    updated_at: datetime
    class_name: str | None = None
    total_marked: int


class DashboardSummaryRead(BaseModel):
    total_students: int
    total_classes: int
    today_attendance_percentage: float
    present_count: int
    absent_count: int
    late_count: int
    recent_activity: RecentActivityRead | None = None
