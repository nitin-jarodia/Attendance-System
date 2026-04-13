from datetime import date, datetime

from pydantic import BaseModel


class TrendPointRead(BaseModel):
    date: date
    attendance_percentage: float
    present_count: int
    absent_count: int
    late_count: int


class StudentAnalyticsRead(BaseModel):
    roll_number: int
    name: str
    class_id: int | None = None
    class_name: str | None = None
    total_days: int
    present_count: int
    absent_count: int
    late_count: int
    attendance_percentage: float
    is_low_attendance: bool


class StudentAnalyticsResponse(BaseModel):
    items: list[StudentAnalyticsRead]
    total: int
    page: int
    page_size: int


class ClassAnalyticsRead(BaseModel):
    class_id: int
    class_name: str
    total_students: int
    present_count: int
    absent_count: int
    late_count: int
    attendance_percentage: float


class ClassAnalyticsResponse(BaseModel):
    items: list[ClassAnalyticsRead]


class AnalyticsSummaryRead(BaseModel):
    attendance_date: date
    class_id: int | None = None
    class_name: str | None = None
    total_students: int
    present_count: int
    absent_count: int
    late_count: int
    attendance_percentage: float
    low_attendance_students: int
    frequently_absent_students: int
    ai_summary: str
    used_fallback: bool


class StudentInsightRead(BaseModel):
    roll_number: int
    name: str
    class_id: int | None = None
    class_name: str | None = None
    total_days: int
    present_count: int
    absent_count: int
    late_count: int
    attendance_percentage: float
    absent_percentage: float
    is_low_attendance: bool
    frequent_absence: bool
    recent_trend: list[TrendPointRead]
    ai_insight: str
    used_fallback: bool


class ClassInsightRead(BaseModel):
    class_id: int
    class_name: str
    total_students: int
    present_count: int
    absent_count: int
    late_count: int
    attendance_percentage: float
    trend: list[TrendPointRead]
    low_attendance_students: list[StudentAnalyticsRead]
    ai_insight: str
    used_fallback: bool


class PredictionRead(BaseModel):
    roll_number: int
    name: str
    class_id: int | None = None
    class_name: str | None = None
    attendance_percentage: float
    total_days: int
    absent_count: int
    recent_attendance_percentage: float
    risk_score: int
    risk_level: str
    explanation: str


class PredictionsResponse(BaseModel):
    items: list[PredictionRead]


class RealtimeAttendanceEvent(BaseModel):
    type: str
    action: str
    attendance_date: date
    class_ids: list[int]
    roll_numbers: list[int]
    message: str
    updated_at: datetime
