from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.schemas.student import BulkStudentCreate, BulkStudentResult, StudentCreate, StudentRead
from app.services.student_service import bulk_create_students, create_student, list_students


router = APIRouter(prefix="/students", tags=["students"])


@router.post("/add", response_model=StudentRead, status_code=status.HTTP_201_CREATED)
def add_student(payload: StudentCreate, db: Session = Depends(get_db)) -> StudentRead:
    try:
        return create_student(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/bulk", response_model=BulkStudentResult, status_code=status.HTTP_201_CREATED)
def bulk_add_students(payload: BulkStudentCreate, db: Session = Depends(get_db)) -> BulkStudentResult:
    try:
        return bulk_create_students(db, payload.raw_text)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("", response_model=list[StudentRead])
def get_students(db: Session = Depends(get_db)) -> list[StudentRead]:
    return list_students(db)
