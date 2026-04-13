from pydantic import BaseModel


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
