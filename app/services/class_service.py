from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.classroom import Classroom
from app.models.student import Student
from app.models.user import User
from app.schemas.classroom import ClassCreate, ClassRead, ClassUpdate


def _class_rows(db: Session, class_id: int | None = None) -> list:
    statement = (
        select(
            Classroom.id,
            Classroom.name,
            func.count(Student.id).label("student_count"),
        )
        .outerjoin(Student, Student.class_id == Classroom.id)
        .group_by(Classroom.id, Classroom.name)
        .order_by(Classroom.name.asc())
    )
    if class_id is not None:
        statement = statement.where(Classroom.id == class_id)
    return db.execute(statement).all()


def list_classes(db: Session, current_user: User) -> list[ClassRead]:
    class_id = current_user.assigned_class_id if current_user.role == "teacher" else None
    rows = _class_rows(db, class_id)
    return [ClassRead(id=row.id, name=row.name, student_count=row.student_count) for row in rows]


def create_class(db: Session, payload: ClassCreate) -> ClassRead:
    classroom = Classroom(name=payload.name)
    db.add(classroom)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ValueError("A class with this name already exists.") from exc

    db.refresh(classroom)
    return ClassRead(id=classroom.id, name=classroom.name, student_count=0)


def update_class(db: Session, class_id: int, payload: ClassUpdate) -> ClassRead:
    classroom = db.scalar(select(Classroom).where(Classroom.id == class_id))
    if classroom is None:
        raise LookupError("Class not found.")

    classroom.name = payload.name
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ValueError("A class with this name already exists.") from exc

    rows = _class_rows(db, class_id)
    row = rows[0]
    return ClassRead(id=row.id, name=row.name, student_count=row.student_count)


def delete_class(db: Session, class_id: int) -> None:
    classroom = db.scalar(select(Classroom).where(Classroom.id == class_id))
    if classroom is None:
        raise LookupError("Class not found.")

    student_count = db.scalar(select(func.count(Student.id)).where(Student.class_id == class_id)) or 0
    user_count = db.scalar(select(func.count(User.id)).where(User.assigned_class_id == class_id)) or 0
    if student_count or user_count:
        raise ValueError("Cannot delete a class while students or users are assigned to it.")

    db.delete(classroom)
    db.commit()
