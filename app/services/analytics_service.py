from datetime import date

from sqlalchemy import String, and_, case, cast, func, or_, select
from sqlalchemy.orm import Session

from app.models.attendance import Attendance
from app.models.classroom import Classroom
from app.models.student import Student
from app.models.user import User
from app.schemas.analytics import (
    ClassAnalyticsRead,
    ClassAnalyticsResponse,
    StudentAnalyticsRead,
    StudentAnalyticsResponse,
)


def _date_join_filters(start_date: date | None, end_date: date | None) -> list:
    filters = []
    if start_date is not None:
        filters.append(Attendance.date >= start_date)
    if end_date is not None:
        filters.append(Attendance.date <= end_date)
    return filters


def get_student_analytics(
    db: Session,
    current_user: User,
    class_id: int | None = None,
    search: str | None = None,
    threshold: float = 75.0,
    page: int = 1,
    page_size: int = 10,
    start_date: date | None = None,
    end_date: date | None = None,
) -> StudentAnalyticsResponse:
    effective_class_id = current_user.assigned_class_id if current_user.role == "teacher" else class_id
    if current_user.role == "teacher" and class_id not in (None, current_user.assigned_class_id):
        raise PermissionError("Teachers can only access their assigned class.")

    attendance_join_condition = and_(
        Attendance.roll_number == Student.roll_number,
        *_date_join_filters(start_date, end_date),
    )

    filters = []
    if effective_class_id is not None:
        filters.append(Student.class_id == effective_class_id)
    if search:
        search_term = f"%{search.strip()}%"
        filters.append(
            or_(
                Student.name.ilike(search_term),
                cast(Student.roll_number, String).ilike(search_term),
            )
        )

    grouped_statement = (
        select(
            Student.roll_number,
            Student.name,
            Student.class_id,
            Classroom.name.label("class_name"),
            func.count(Attendance.id).label("total_days"),
            func.coalesce(func.sum(case((Attendance.status == "present", 1), else_=0)), 0).label(
                "present_count"
            ),
            func.coalesce(func.sum(case((Attendance.status == "absent", 1), else_=0)), 0).label(
                "absent_count"
            ),
            func.coalesce(func.sum(case((Attendance.status == "late", 1), else_=0)), 0).label(
                "late_count"
            ),
        )
        .select_from(Student)
        .outerjoin(Classroom, Classroom.id == Student.class_id)
        .outerjoin(Attendance, attendance_join_condition)
        .where(*filters)
        .group_by(Student.id, Student.roll_number, Student.name, Student.class_id, Classroom.name)
        .order_by(Student.roll_number.asc())
    )

    grouped_subquery = grouped_statement.subquery()
    total = db.scalar(select(func.count()).select_from(grouped_subquery)) or 0
    rows = db.execute(
        select(grouped_subquery).offset((page - 1) * page_size).limit(page_size)
    ).all()

    items = []
    for row in rows:
        total_days = row.total_days or 0
        attendance_percentage = round(
            (((row.present_count or 0) + (row.late_count or 0)) / total_days) * 100,
            2,
        ) if total_days else 0.0
        items.append(
            StudentAnalyticsRead(
                roll_number=row.roll_number,
                name=row.name,
                class_id=row.class_id,
                class_name=row.class_name,
                total_days=total_days,
                present_count=row.present_count or 0,
                absent_count=row.absent_count or 0,
                late_count=row.late_count or 0,
                attendance_percentage=attendance_percentage,
                is_low_attendance=attendance_percentage < threshold,
            )
        )

    return StudentAnalyticsResponse(items=items, total=total, page=page, page_size=page_size)


def get_class_analytics(
    db: Session,
    current_user: User,
    start_date: date | None = None,
    end_date: date | None = None,
) -> ClassAnalyticsResponse:
    filters = []
    if current_user.role == "teacher":
        filters.append(Classroom.id == current_user.assigned_class_id)

    attendance_join_condition = and_(
        Attendance.roll_number == Student.roll_number,
        *_date_join_filters(start_date, end_date),
    )

    statement = (
        select(
            Classroom.id.label("class_id"),
            Classroom.name.label("class_name"),
            func.count(func.distinct(Student.id)).label("total_students"),
            func.coalesce(func.sum(case((Attendance.status == "present", 1), else_=0)), 0).label(
                "present_count"
            ),
            func.coalesce(func.sum(case((Attendance.status == "absent", 1), else_=0)), 0).label(
                "absent_count"
            ),
            func.coalesce(func.sum(case((Attendance.status == "late", 1), else_=0)), 0).label(
                "late_count"
            ),
        )
        .select_from(Classroom)
        .outerjoin(Student, Student.class_id == Classroom.id)
        .outerjoin(Attendance, attendance_join_condition)
        .where(*filters)
        .group_by(Classroom.id, Classroom.name)
        .order_by(Classroom.name.asc())
    )
    rows = db.execute(statement).all()

    items = []
    for row in rows:
        total_records = (row.present_count or 0) + (row.absent_count or 0) + (row.late_count or 0)
        attendance_percentage = round(
            (((row.present_count or 0) + (row.late_count or 0)) / total_records) * 100,
            2,
        ) if total_records else 0.0
        items.append(
            ClassAnalyticsRead(
                class_id=row.class_id,
                class_name=row.class_name,
                total_students=row.total_students or 0,
                present_count=row.present_count or 0,
                absent_count=row.absent_count or 0,
                late_count=row.late_count or 0,
                attendance_percentage=attendance_percentage,
            )
        )

    return ClassAnalyticsResponse(items=items)
