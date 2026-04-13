from datetime import date
from enum import Enum

from pydantic import BaseModel, Field, field_validator


class AttendanceStatus(str, Enum):
    present = "present"
    absent = "absent"
    late = "late"


class AttendanceMarkItem(BaseModel):
    roll_number: int = Field(gt=0)
    status: AttendanceStatus


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


class AttendanceDeleteRequest(BaseModel):
    roll_number: int = Field(gt=0)
    date: date


class AttendanceRecordRead(BaseModel):
    roll_number: int
    name: str
    status: AttendanceStatus
    date: date


class AttendanceMarkResponse(BaseModel):
    date: date
    created_count: int
    updated_count: int
    records: list[AttendanceRecordRead]


class AttendanceDeleteResponse(BaseModel):
    message: str
    roll_number: int
    date: date
