from datetime import date, datetime

from pydantic import BaseModel, Field


class ResetDayRequest(BaseModel):
    target_date: date


class ResetAllRequest(BaseModel):
    confirmation_text: str = Field(min_length=5)


class UndoResetRequest(BaseModel):
    snapshot_id: int = Field(gt=0)


class ResetResponse(BaseModel):
    message: str
    snapshot_id: int | None = None
    target_date: date | None = None
    undo_expires_at: datetime | None = None
    deleted_records: int


class ActivityLogRead(BaseModel):
    id: int
    action_type: str
    performed_by: int
    performer_name: str
    performer_role: str | None = None
    target_type: str | None = None
    target_id: int | None = None
    target_name: str | None = None
    details: str
    previous_value: str | None = None
    new_value: str | None = None
    created_at: datetime


class ActivityLogResponse(BaseModel):
    items: list[ActivityLogRead]
    total: int
    page: int
    page_size: int
