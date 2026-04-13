from sqlalchemy import String, func, or_, cast, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.classroom import Classroom
from app.models.student import Student
from app.models.user import User
from app.schemas.student import (
    BulkStudentResult,
    StudentClassUpdate,
    StudentCreate,
    StudentRead,
    StudentSearchResponse,
)


def _resolve_class_scope(class_id: int | None, current_user: User) -> int | None:
    if current_user.role != "teacher":
        return class_id

    if current_user.assigned_class_id is None:
        raise PermissionError("Teacher account is not assigned to a class.")

    if class_id is not None and class_id != current_user.assigned_class_id:
        raise PermissionError("Teachers can only access their assigned class.")

    return current_user.assigned_class_id


def _serialize_student(student: Student, class_name: str | None) -> StudentRead:
    return StudentRead(
        id=student.id,
        roll_number=student.roll_number,
        name=student.name,
        class_id=student.class_id,
        class_name=class_name,
    )


def _list_students_by_filters(
    db: Session,
    search: str | None,
    class_id: int | None,
) -> list[StudentRead]:
    statement = (
        select(Student, Classroom.name.label("class_name"))
        .outerjoin(Classroom, Classroom.id == Student.class_id)
        .where(*_student_filters(search, class_id))
        .order_by(Student.roll_number.asc())
    )
    rows = db.execute(statement).all()
    return [_serialize_student(student=row.Student, class_name=row.class_name) for row in rows]


def _student_filters(search: str | None, class_id: int | None) -> list:
    filters = []
    if class_id is not None:
        filters.append(Student.class_id == class_id)
    if search:
        search_term = f"%{search.strip()}%"
        filters.append(
            or_(
                Student.name.ilike(search_term),
                cast(Student.roll_number, String).ilike(search_term),
            )
        )
    return filters


def _validate_class_exists(db: Session, class_id: int | None) -> None:
    if class_id is None:
        return

    classroom = db.scalar(select(Classroom).where(Classroom.id == class_id))
    if classroom is None:
        raise ValueError("Selected class was not found.")


def list_students(
    db: Session,
    current_user: User,
    search: str | None = None,
    class_id: int | None = None,
) -> list[StudentRead]:
    effective_class_id = _resolve_class_scope(class_id, current_user)
    return _list_students_by_filters(db, search, effective_class_id)


def search_students(
    db: Session,
    current_user: User,
    search: str | None = None,
    class_id: int | None = None,
    page: int = 1,
    page_size: int = 10,
) -> StudentSearchResponse:
    effective_class_id = _resolve_class_scope(class_id, current_user)
    filters = _student_filters(search, effective_class_id)

    total = db.scalar(select(func.count(Student.id)).where(*filters)) or 0
    statement = (
        select(Student, Classroom.name.label("class_name"))
        .outerjoin(Classroom, Classroom.id == Student.class_id)
        .where(*filters)
        .order_by(Student.roll_number.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = db.execute(statement).all()
    return StudentSearchResponse(
        items=[_serialize_student(student=row.Student, class_name=row.class_name) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


def create_student(db: Session, payload: StudentCreate) -> Student:
    _validate_class_exists(db, payload.class_id)
    existing_student = db.scalar(select(Student).where(Student.roll_number == payload.roll_number))
    if existing_student:
        raise ValueError(f"Student with roll number {payload.roll_number} already exists.")

    student = Student(
        roll_number=payload.roll_number,
        name=payload.name,
        class_id=payload.class_id,
    )
    db.add(student)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ValueError("Unable to create student because the roll number already exists.") from exc

    db.refresh(student)
    return student


def bulk_create_students(db: Session, raw_text: str, class_id: int | None = None) -> BulkStudentResult:
    _validate_class_exists(db, class_id)
    skipped_lines: list[str] = []
    duplicate_roll_numbers: list[int] = []
    parsed_students: list[StudentCreate] = []
    seen_roll_numbers: set[int] = set()

    for line_number, raw_line in enumerate(raw_text.splitlines(), start=1):
        line = raw_line.strip()
        if not line:
            continue

        parts = [part.strip() for part in line.split(",", 1)]
        if len(parts) != 2 or not parts[0] or not parts[1]:
            skipped_lines.append(f"Line {line_number}: {raw_line}")
            continue

        try:
            roll_number = int(parts[0])
            student = StudentCreate(roll_number=roll_number, name=parts[1], class_id=class_id)
        except (ValueError, TypeError):
            skipped_lines.append(f"Line {line_number}: {raw_line}")
            continue

        if student.roll_number in seen_roll_numbers:
            duplicate_roll_numbers.append(student.roll_number)
            continue

        seen_roll_numbers.add(student.roll_number)
        parsed_students.append(student)

    if not parsed_students:
        return BulkStudentResult(
            created_count=0,
            skipped_lines=skipped_lines,
            duplicate_roll_numbers=sorted(set(duplicate_roll_numbers)),
            students=[],
        )

    existing_rolls = {
        roll_number
        for roll_number in db.scalars(
            select(Student.roll_number).where(
                Student.roll_number.in_([student.roll_number for student in parsed_students])
            )
        ).all()
    }

    students_to_create = []
    for student in parsed_students:
        if student.roll_number in existing_rolls:
            duplicate_roll_numbers.append(student.roll_number)
            continue
        students_to_create.append(
            Student(
                roll_number=student.roll_number,
                name=student.name,
                class_id=student.class_id,
            )
        )

    if students_to_create:
        db.add_all(students_to_create)
        try:
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            raise ValueError("Bulk upload failed because one or more roll numbers already exist.") from exc

    created_roll_numbers = {student.roll_number for student in students_to_create}
    created_students = _list_students_by_filters(db, None, class_id)

    return BulkStudentResult(
        created_count=len(students_to_create),
        skipped_lines=skipped_lines,
        duplicate_roll_numbers=sorted(set(duplicate_roll_numbers)),
        students=[student for student in created_students if student.roll_number in created_roll_numbers],
    )


def assign_student_class(db: Session, roll_number: int, payload: StudentClassUpdate) -> StudentRead:
    _validate_class_exists(db, payload.class_id)
    student = db.scalar(select(Student).where(Student.roll_number == roll_number))
    if student is None:
        raise LookupError("Student not found.")

    student.class_id = payload.class_id
    db.commit()
    db.refresh(student)
    class_name = db.scalar(select(Classroom.name).where(Classroom.id == student.class_id))
    return _serialize_student(student, class_name)
