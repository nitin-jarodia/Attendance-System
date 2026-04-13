import csv
import io
from datetime import date

from sqlalchemy import String, and_, cast, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.attendance import Attendance
from app.models.classroom import Classroom
from app.models.student import Student
from app.models.user import User
from app.schemas.attendance import (
    AttendanceDeleteRequest,
    AttendanceMarkRequest,
    AttendanceMarkResponse,
    AttendanceRecordRead,
    AttendanceSearchResponse,
    AttendanceStatus,
    AttendanceUpdateRequest,
)


def _resolve_class_scope(class_id: int | None, current_user: User) -> int | None:
    if current_user.role != "teacher":
        return class_id

    if current_user.assigned_class_id is None:
        raise PermissionError("Teacher account is not assigned to a class.")

    if class_id is not None and class_id != current_user.assigned_class_id:
        raise PermissionError("Teachers can only access their assigned class.")

    return current_user.assigned_class_id


def _attendance_filters(
    attendance_date: date | None,
    class_id: int | None,
    status: AttendanceStatus | None,
    search: str | None,
) -> list:
    filters = []
    if attendance_date is not None:
        filters.append(Attendance.date == attendance_date)
    if class_id is not None:
        filters.append(Student.class_id == class_id)
    if status is not None:
        filters.append(Attendance.status == status.value)
    if search:
        search_term = f"%{search.strip()}%"
        filters.append(
            or_(
                Student.name.ilike(search_term),
                cast(Student.roll_number, String).ilike(search_term),
            )
        )
    return filters


def _serialize_attendance_row(row) -> AttendanceRecordRead:
    return AttendanceRecordRead(
        roll_number=row.roll_number,
        name=row.name,
        status=row.status,
        date=row.date,
        class_id=row.class_id,
        class_name=row.class_name,
    )


def list_attendance_by_date(
    db: Session,
    attendance_date: date,
    current_user: User,
    class_id: int | None = None,
    status: AttendanceStatus | None = None,
    search: str | None = None,
) -> list[AttendanceRecordRead]:
    effective_class_id = _resolve_class_scope(class_id, current_user)
    statement = (
        select(
            Attendance.roll_number,
            Student.name,
            Attendance.status,
            Attendance.date,
            Student.class_id,
            Classroom.name.label("class_name"),
        )
        .join(Student, Student.roll_number == Attendance.roll_number)
        .outerjoin(Classroom, Classroom.id == Student.class_id)
        .where(*_attendance_filters(attendance_date, effective_class_id, status, search))
        .order_by(Attendance.roll_number.asc())
    )
    rows = db.execute(statement).all()
    return [_serialize_attendance_row(row) for row in rows]


def search_attendance(
    db: Session,
    current_user: User,
    attendance_date: date | None = None,
    class_id: int | None = None,
    status: AttendanceStatus | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 10,
) -> AttendanceSearchResponse:
    effective_class_id = _resolve_class_scope(class_id, current_user)
    filters = _attendance_filters(attendance_date, effective_class_id, status, search)

    total = db.scalar(
        select(func.count(Attendance.id))
        .select_from(Attendance)
        .join(Student, Student.roll_number == Attendance.roll_number)
        .where(*filters)
    ) or 0

    statement = (
        select(
            Attendance.roll_number,
            Student.name,
            Attendance.status,
            Attendance.date,
            Student.class_id,
            Classroom.name.label("class_name"),
        )
        .join(Student, Student.roll_number == Attendance.roll_number)
        .outerjoin(Classroom, Classroom.id == Student.class_id)
        .where(*filters)
        .order_by(Attendance.date.desc(), Attendance.roll_number.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = db.execute(statement).all()
    return AttendanceSearchResponse(
        items=[_serialize_attendance_row(row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


def mark_attendance(db: Session, payload: AttendanceMarkRequest, current_user: User) -> AttendanceMarkResponse:
    requested_roll_numbers = [record.roll_number for record in payload.records]
    students = list(
        db.scalars(select(Student).where(Student.roll_number.in_(requested_roll_numbers))).all()
    )
    student_roll_numbers = {student.roll_number for student in students}

    missing_roll_numbers = sorted(set(requested_roll_numbers) - student_roll_numbers)
    if missing_roll_numbers:
        raise ValueError(
            "Unknown roll numbers in attendance payload: "
            + ", ".join(str(roll_number) for roll_number in missing_roll_numbers)
        )

    if current_user.role == "teacher":
        assigned_class_id = _resolve_class_scope(None, current_user)
        invalid_roll_numbers = sorted(
            student.roll_number for student in students if student.class_id != assigned_class_id
        )
        if invalid_roll_numbers:
            raise PermissionError("Teachers can only mark attendance for their assigned class.")

    existing_records = {
        attendance.roll_number: attendance
        for attendance in db.scalars(
            select(Attendance).where(
                and_(
                    Attendance.date == payload.date,
                    Attendance.roll_number.in_(requested_roll_numbers),
                )
            )
        ).all()
    }

    created_count = 0
    updated_count = 0

    for record in payload.records:
        existing_record = existing_records.get(record.roll_number)
        if existing_record:
            if existing_record.status != record.status.value:
                existing_record.status = record.status.value
            updated_count += 1
            continue

        db.add(
            Attendance(
                roll_number=record.roll_number,
                date=payload.date,
                status=record.status.value,
            )
        )
        created_count += 1

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ValueError("Unable to save attendance because a duplicate record was detected.") from exc

    return AttendanceMarkResponse(
        date=payload.date,
        created_count=created_count,
        updated_count=updated_count,
        records=list_attendance_by_date(db, payload.date, current_user),
    )


def update_attendance(
    db: Session,
    payload: AttendanceUpdateRequest,
    current_user: User,
) -> AttendanceRecordRead:
    statement = (
        select(Attendance, Student.name, Student.class_id, Classroom.name.label("class_name"))
        .join(Student, Student.roll_number == Attendance.roll_number)
        .outerjoin(Classroom, Classroom.id == Student.class_id)
        .where(
            and_(
                Attendance.roll_number == payload.roll_number,
                Attendance.date == payload.date,
            )
        )
    )
    if current_user.role == "teacher":
        statement = statement.where(Student.class_id == current_user.assigned_class_id)

    row = db.execute(statement).first()
    if not row:
        raise LookupError("Attendance record not found.")

    attendance = row.Attendance
    attendance.status = payload.status.value
    db.commit()
    return _serialize_attendance_row(
        type(
            "AttendanceRow",
            (),
            {
                "roll_number": attendance.roll_number,
                "name": row.name,
                "status": attendance.status,
                "date": attendance.date,
                "class_id": row.class_id,
                "class_name": row.class_name,
            },
        )()
    )


def delete_attendance(
    db: Session, payload: AttendanceDeleteRequest, current_user: User
) -> AttendanceRecordRead:
    statement = (
        select(Attendance, Student.name, Student.class_id, Classroom.name.label("class_name"))
        .join(Student, Student.roll_number == Attendance.roll_number)
        .where(
            and_(
                Attendance.roll_number == payload.roll_number,
                Attendance.date == payload.date,
            )
        )
    )
    if current_user.role == "teacher":
        statement = statement.where(Student.class_id == current_user.assigned_class_id)

    row = db.execute(statement).first()
    if not row:
        raise LookupError("Attendance record not found.")

    attendance = row.Attendance
    deleted_record = _serialize_attendance_row(
        type(
            "AttendanceRow",
            (),
            {
                "roll_number": attendance.roll_number,
                "name": row.name,
                "status": attendance.status,
                "date": attendance.date,
                "class_id": row.class_id,
                "class_name": row.class_name,
            },
        )()
    )
    db.delete(attendance)
    db.commit()
    return deleted_record


def build_csv_export(
    db: Session,
    attendance_date: date,
    current_user: User,
    class_id: int | None = None,
    status: AttendanceStatus | None = None,
    search: str | None = None,
) -> str:
    records = list_attendance_by_date(db, attendance_date, current_user, class_id, status, search)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["roll", "name", "class", "status", "date"])
    for record in records:
        writer.writerow(
            [
                record.roll_number,
                record.name,
                record.class_name or "",
                record.status.value,
                record.date.isoformat(),
            ]
        )

    return output.getvalue()
