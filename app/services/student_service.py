from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.student import Student
from app.schemas.student import BulkStudentResult, StudentCreate


def list_students(db: Session) -> list[Student]:
    statement = select(Student).order_by(Student.roll_number.asc())
    return list(db.scalars(statement).all())


def create_student(db: Session, payload: StudentCreate) -> Student:
    existing_student = db.scalar(select(Student).where(Student.roll_number == payload.roll_number))
    if existing_student:
        raise ValueError(f"Student with roll number {payload.roll_number} already exists.")

    student = Student(roll_number=payload.roll_number, name=payload.name)
    db.add(student)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ValueError("Unable to create student because the roll number already exists.") from exc

    db.refresh(student)
    return student


def bulk_create_students(db: Session, raw_text: str) -> BulkStudentResult:
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
            student = StudentCreate(roll_number=roll_number, name=parts[1])
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
        students_to_create.append(Student(roll_number=student.roll_number, name=student.name))

    if students_to_create:
        db.add_all(students_to_create)
        try:
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            raise ValueError("Bulk upload failed because one or more roll numbers already exist.") from exc

    created_students = list_students(db)
    created_roll_numbers = {student.roll_number for student in students_to_create}

    return BulkStudentResult(
        created_count=len(students_to_create),
        skipped_lines=skipped_lines,
        duplicate_roll_numbers=sorted(set(duplicate_roll_numbers)),
        students=[student for student in created_students if student.roll_number in created_roll_numbers],
    )
