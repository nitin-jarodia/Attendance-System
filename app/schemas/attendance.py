from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, Field, field_validator


class AttendanceStatus(str, Enum):
    present = "present"
    absent = "absent"
    late = "late"


class AttendanceMarkItem(BaseModel):
    roll_number: int = Field(gt=0)
    status: AttendanceStatus
    late_arrival_time: datetime | None = None


class AttendanceMarkRequest(BaseModel):
    date: date
    records: list[AttendanceMarkItem] = Field(min_length=1)

    @field_validator("records")
    @classmethod
    def validate_unique_roll_numbers(cls, records: list[AttendanceMarkItem]) -> list[AttendanceMarkItem]:
        roll_numbers = [record.roll_number for record in records]
        if len(roll_numbers) != len(set(roll_numbers)):
            raise ValueError("Duplicate roll numbers found in attendance payload.")
        return records


class AttendanceUpdateRequest(BaseModel):
    roll_number: int = Field(gt=0)
    date: date
    status: AttendanceStatus
    late_arrival_time: datetime | None = None


class AttendanceDeleteRequest(BaseModel):
    roll_number: int = Field(gt=0)
    date: date


class AttendanceRecordRead(BaseModel):
    roll_number: int
    name: str
    status: AttendanceStatus
    date: date
    class_id: int | None = None
    class_name: str | None = None
    late_arrival_time: datetime | None = None
    previous_status: str | None = None
    edited_by: str | None = None
    edited_at: datetime | None = None


class AttendanceMarkResponse(BaseModel):
    date: date
    created_count: int
    updated_count: int
    records: list[AttendanceRecordRead]


class AttendanceDeleteResponse(BaseModel):
    message: str
    roll_number: int
    date: date


class AttendanceSearchResponse(BaseModel):
    items: list[AttendanceRecordRead]
    total: int
    page: int
    page_size: int


class LateArrivalRead(BaseModel):
    roll_number: int
    name: str
    class_id: int | None = None
    class_name: str | None = None
    date: date
    late_arrival_time: datetime | None = None
    late_count_this_week: int = 0


class LateArrivalsResponse(BaseModel):
    items: list[LateArrivalRead]
    total: int
    page: int
    page_size: int
