from pydantic import BaseModel, ConfigDict, Field, field_validator


class StudentCreate(BaseModel):
    roll_number: int = Field(gt=0)
    name: str = Field(min_length=1, max_length=255)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        cleaned = " ".join(value.strip().split())
        if not cleaned:
            raise ValueError("Name cannot be empty.")
        return cleaned


class BulkStudentCreate(BaseModel):
    raw_text: str = Field(min_length=1)


class StudentRead(BaseModel):
    id: int
    roll_number: int
    name: str

    model_config = ConfigDict(from_attributes=True)


class BulkStudentResult(BaseModel):
    created_count: int
    skipped_lines: list[str]
    duplicate_roll_numbers: list[int]
    students: list[StudentRead]
