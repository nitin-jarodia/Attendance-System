from pydantic import BaseModel, ConfigDict, Field, field_validator


class ClassCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        cleaned = " ".join(value.strip().split())
        if not cleaned:
            raise ValueError("Class name cannot be empty.")
        return cleaned


class ClassUpdate(ClassCreate):
    pass


class ClassRead(BaseModel):
    id: int
    name: str
    student_count: int = 0

    model_config = ConfigDict(from_attributes=True)
