import csv
import io
from datetime import date

from sqlalchemy import and_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.attendance import Attendance
from app.models.student import Student
from app.schemas.attendance import (
    AttendanceDeleteRequest,
    AttendanceMarkRequest,
    AttendanceMarkResponse,
    AttendanceRecordRead,
    AttendanceUpdateRequest,
)


def list_attendance_by_date(db: Session, attendance_date: date) -> list[AttendanceRecordRead]:
    statement = (
        select(Attendance.roll_number, Student.name, Attendance.status, Attendance.date)
        .join(Student, Student.roll_number == Attendance.roll_number)
        .where(Attendance.date == attendance_date)
        .order_by(Attendance.roll_number.asc())
    )
    rows = db.execute(statement).all()
    return [
        AttendanceRecordRead(
            roll_number=row.roll_number,
            name=row.name,
            status=row.status,
            date=row.date,
        )
        for row in rows
    ]


def mark_attendance(db: Session, payload: AttendanceMarkRequest) -> AttendanceMarkResponse:
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
        records=list_attendance_by_date(db, payload.date),
    )


def update_attendance(db: Session, payload: AttendanceUpdateRequest) -> AttendanceRecordRead:
    attendance = db.scalar(
        select(Attendance).where(
            and_(
                Attendance.roll_number == payload.roll_number,
                Attendance.date == payload.date,
            )
        )
    )
    if not attendance:
        raise LookupError("Attendance record not found.")

    attendance.status = payload.status.value
    db.commit()

    student = db.scalar(select(Student).where(Student.roll_number == payload.roll_number))
    return AttendanceRecordRead(
        roll_number=attendance.roll_number,
        name=student.name if student else "",
        status=attendance.status,
        date=attendance.date,
    )


def delete_attendance(db: Session, payload: AttendanceDeleteRequest) -> None:
    attendance = db.scalar(
        select(Attendance).where(
            and_(
                Attendance.roll_number == payload.roll_number,
                Attendance.date == payload.date,
            )
        )
    )
    if not attendance:
        raise LookupError("Attendance record not found.")

    db.delete(attendance)
    db.commit()


def build_csv_export(db: Session, attendance_date: date) -> str:
    records = list_attendance_by_date(db, attendance_date)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["roll", "name", "status", "date"])
    for record in records:
        writer.writerow([record.roll_number, record.name, record.status.value, record.date.isoformat()])

    return output.getvalue()
