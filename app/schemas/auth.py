from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, field_validator


class UserRole(str, Enum):
    admin = "admin"
    teacher = "teacher"


class LoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=100)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        return value.strip().lower()


class CurrentUserRead(BaseModel):
    id: int
    username: str
    role: UserRole
    assigned_class_id: int | None = None
    assigned_class_name: str | None = None

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: CurrentUserRead


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=100)
    password: str = Field(min_length=8, max_length=128)
    role: UserRole
    assigned_class_id: int | None = Field(default=None, gt=0)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        return value.strip().lower()


class UserRead(BaseModel):
    id: int
    username: str
    role: UserRole
    assigned_class_id: int | None = None
    assigned_class_name: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
