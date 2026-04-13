from datetime import date

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models.attendance import Attendance
from app.models.classroom import Classroom
from app.models.student import Student
from app.models.user import User
from app.schemas.dashboard import DashboardSummaryRead, RecentActivityRead


def get_dashboard_summary(db: Session, current_user: User) -> DashboardSummaryRead:
    today = date.today()
    class_filter = Student.class_id == current_user.assigned_class_id if current_user.role == "teacher" else None

    student_count_statement = select(func.count(Student.id))
    if class_filter is not None:
        student_count_statement = student_count_statement.where(class_filter)
    total_students = db.scalar(student_count_statement) or 0

    if current_user.role == "teacher":
        total_classes = 1 if current_user.assigned_class_id else 0
    else:
        total_classes = db.scalar(select(func.count(Classroom.id))) or 0

    attendance_statement = (
        select(
            func.coalesce(func.sum(case((Attendance.status == "present", 1), else_=0)), 0),
            func.coalesce(func.sum(case((Attendance.status == "absent", 1), else_=0)), 0),
            func.coalesce(func.sum(case((Attendance.status == "late", 1), else_=0)), 0),
        )
        .select_from(Attendance)
        .join(Student, Student.roll_number == Attendance.roll_number)
        .where(Attendance.date == today)
    )
    if class_filter is not None:
        attendance_statement = attendance_statement.where(class_filter)

    present_count, absent_count, late_count = db.execute(attendance_statement).one()
    today_attendance_percentage = round((present_count / total_students) * 100, 2) if total_students else 0.0

    latest_activity_statement = (
        select(
            Attendance.date,
            Attendance.updated_at,
            Classroom.name.label("class_name"),
            func.count(Attendance.id).label("total_marked"),
        )
        .select_from(Attendance)
        .join(Student, Student.roll_number == Attendance.roll_number)
        .outerjoin(Classroom, Classroom.id == Student.class_id)
        .group_by(Attendance.date, Attendance.updated_at, Classroom.name)
        .order_by(Attendance.updated_at.desc())
    )
    if class_filter is not None:
        latest_activity_statement = latest_activity_statement.where(class_filter)

    latest_activity_row = db.execute(latest_activity_statement.limit(1)).first()
    recent_activity = None
    if latest_activity_row:
        recent_activity = RecentActivityRead(
            attendance_date=latest_activity_row.date,
            updated_at=latest_activity_row.updated_at,
            class_name=latest_activity_row.class_name,
            total_marked=latest_activity_row.total_marked,
        )

    return DashboardSummaryRead(
        total_students=total_students,
        total_classes=total_classes,
        today_attendance_percentage=today_attendance_percentage,
        present_count=present_count,
        absent_count=absent_count,
        late_count=late_count,
        recent_activity=recent_activity,
    )
