from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user, require_admin
from app.db.database import get_db
from app.models.user import User
from app.schemas.student import (
    BulkStudentCreate,
    BulkStudentResult,
    StudentClassUpdate,
    StudentCreate,
    StudentRead,
    StudentSearchResponse,
)
from app.services.activity_service import log_activity
from app.services.student_service import (
    assign_student_class,
    bulk_create_students,
    create_student,
    list_students,
    search_students,
)


router = APIRouter(prefix="/students", tags=["students"])


@router.post("/add", response_model=StudentRead, status_code=status.HTTP_201_CREATED)
def add_student(
    payload: StudentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> StudentRead:
    try:
        student = create_student(db, payload)
        result = StudentRead(
            id=student.id,
            roll_number=student.roll_number,
            name=student.name,
            class_id=student.class_id,
            class_name=student.classroom.name if student.classroom else None,
        )
        log_activity(
            db,
            action_type="STUDENT_ADDED",
            user=current_user,
            details=f"Added student: {student.name} (Roll #{student.roll_number})",
            target_type="student",
            target_id=student.roll_number,
            target_name=student.name,
        )
        db.commit()
        return result
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/bulk", response_model=BulkStudentResult, status_code=status.HTTP_201_CREATED)
def bulk_add_students(
    payload: BulkStudentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> BulkStudentResult:
    try:
        result = bulk_create_students(db, payload.raw_text, payload.class_id)
        log_activity(
            db,
            action_type="STUDENT_ADDED",
            user=current_user,
            details=f"Bulk added {result.created_count} students",
            target_type="student",
        )
        db.commit()
        return result
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("", response_model=list[StudentRead])
def get_students(
    search: str | None = Query(default=None),
    class_id: int | None = Query(default=None, gt=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[StudentRead]:
    try:
        return list_students(db, current_user=current_user, search=search, class_id=class_id)
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.get("/search", response_model=StudentSearchResponse)
def search_students_route(
    search: str | None = Query(default=None),
    class_id: int | None = Query(default=None, gt=0),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StudentSearchResponse:
    try:
        return search_students(
            db,
            current_user=current_user,
            search=search,
            class_id=class_id,
            page=page,
            page_size=page_size,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.patch("/{roll_number}/class", response_model=StudentRead)
def assign_student_class_route(
    roll_number: int,
    payload: StudentClassUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> StudentRead:
    try:
        return assign_student_class(db, roll_number, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
