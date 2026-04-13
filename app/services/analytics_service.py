from datetime import date, timedelta

from sqlalchemy import String, and_, case, cast, func, or_, select
from sqlalchemy.orm import Session

from app.ai.groq_service import GroqServiceError, generate_natural_language_summary
from app.models.attendance import Attendance
from app.models.classroom import Classroom
from app.models.student import Student
from app.models.user import User
from app.schemas.analytics import (
    AnalyticsSummaryRead,
    ClassAnalyticsRead,
    ClassAnalyticsResponse,
    ClassInsightRead,
    PredictionRead,
    PredictionsResponse,
    StudentAnalyticsRead,
    StudentAnalyticsResponse,
    StudentInsightRead,
    TrendPointRead,
)


def _date_join_filters(start_date: date | None, end_date: date | None) -> list:
    filters = []
    if start_date is not None:
        filters.append(Attendance.date >= start_date)
    if end_date is not None:
        filters.append(Attendance.date <= end_date)
    return filters


def _resolve_class_scope(current_user: User, class_id: int | None) -> int | None:
    if current_user.role in ("admin", "principal"):
        return class_id

    if current_user.assigned_class_id is None:
        raise PermissionError("Teacher account is not assigned to a class.")
    if class_id not in (None, current_user.assigned_class_id):
        raise PermissionError("Teachers can only access their assigned class.")
    return current_user.assigned_class_id


def _attendance_percentage(present_count: int, late_count: int, total_days: int) -> float:
    return round((((present_count or 0) + (late_count or 0)) / total_days) * 100, 2) if total_days else 0.0


def _student_filters(
    effective_class_id: int | None,
    search: str | None,
    roll_number: int | None = None,
) -> list:
    filters = []
    if effective_class_id is not None:
        filters.append(Student.class_id == effective_class_id)
    if roll_number is not None:
        filters.append(Student.roll_number == roll_number)
    if search:
        search_term = f"%{search.strip()}%"
        filters.append(
            or_(
                Student.name.ilike(search_term),
                cast(Student.roll_number, String).ilike(search_term),
            )
        )
    return filters


def _student_grouped_statement(
    *,
    effective_class_id: int | None,
    search: str | None,
    roll_number: int | None = None,
    start_date: date | None,
    end_date: date | None,
):
    attendance_join_condition = and_(
        Attendance.roll_number == Student.roll_number,
        *_date_join_filters(start_date, end_date),
    )
    return (
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
        .where(*_student_filters(effective_class_id, search, roll_number))
        .group_by(Student.id, Student.roll_number, Student.name, Student.class_id, Classroom.name)
        .order_by(Student.roll_number.asc())
    )


def _serialize_student_analytics(row, threshold: float) -> StudentAnalyticsRead:
    total_days = row.total_days or 0
    attendance_percentage = _attendance_percentage(
        row.present_count or 0,
        row.late_count or 0,
        total_days,
    )
    return StudentAnalyticsRead(
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


def _rule_based_summary_text(summary: AnalyticsSummaryRead) -> str:
    return (
        f"{summary.attendance_percentage}% of students are marked present or late on "
        f"{summary.attendance_date.isoformat()}. Present: {summary.present_count}, "
        f"absent: {summary.absent_count}, late: {summary.late_count}. "
        f"{summary.low_attendance_students} students are below the 75% threshold."
    )


def _rule_based_student_insight(student: StudentInsightRead) -> str:
    if student.total_days == 0:
        return f"{student.name} has no attendance records yet, so there is no trend to analyze."
    if student.is_low_attendance:
        return (
            f"{student.name} is below the 75% target at {student.attendance_percentage}%. "
            f"Absences account for {student.absent_percentage}% of tracked days."
        )
    return (
        f"{student.name} is currently stable at {student.attendance_percentage}% attendance "
        f"with {student.absent_count} absences across {student.total_days} recorded days."
    )


def _rule_based_class_insight(classroom: ClassInsightRead) -> str:
    if not classroom.trend:
        return f"{classroom.class_name} has no attendance trend data yet."
    return (
        f"{classroom.class_name} is at {classroom.attendance_percentage}% overall attendance. "
        f"{len(classroom.low_attendance_students)} students are currently below the 75% threshold."
    )


def _prediction_risk(row, recent_attendance_percentage: float, threshold: float) -> tuple[int, str, str]:
    score = 0
    if row.attendance_percentage < threshold:
        score += 55
    elif row.attendance_percentage < threshold + 10:
        score += 30

    if recent_attendance_percentage < row.attendance_percentage:
        score += 20
    if row.absent_count >= 3:
        score += 15
    if recent_attendance_percentage < threshold:
        score += 20

    if score >= 70:
        risk_level = "high"
    elif score >= 45:
        risk_level = "medium"
    else:
        risk_level = "low"

    explanation = (
        f"{row.name} is at {row.attendance_percentage}% overall attendance with "
        f"{row.absent_count} absences. Recent attendance is {recent_attendance_percentage}%."
    )
    return score, risk_level, explanation


def _trend_for_scope(
    db: Session,
    *,
    class_id: int | None = None,
    roll_number: int | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
) -> list[TrendPointRead]:
    statement = (
        select(
            Attendance.date.label("date"),
            func.coalesce(func.sum(case((Attendance.status == "present", 1), else_=0)), 0).label(
                "present_count"
            ),
            func.coalesce(func.sum(case((Attendance.status == "absent", 1), else_=0)), 0).label(
                "absent_count"
            ),
            func.coalesce(func.sum(case((Attendance.status == "late", 1), else_=0)), 0).label(
                "late_count"
            ),
            func.count(Attendance.id).label("total_count"),
        )
        .select_from(Attendance)
        .join(Student, Student.roll_number == Attendance.roll_number)
    )
    if class_id is not None:
        statement = statement.where(Student.class_id == class_id)
    if roll_number is not None:
        statement = statement.where(Attendance.roll_number == roll_number)
    if start_date is not None:
        statement = statement.where(Attendance.date >= start_date)
    if end_date is not None:
        statement = statement.where(Attendance.date <= end_date)

    rows = db.execute(statement.group_by(Attendance.date).order_by(Attendance.date.asc())).all()
    return [
        TrendPointRead(
            date=row.date,
            attendance_percentage=_attendance_percentage(
                row.present_count or 0,
                row.late_count or 0,
                row.total_count or 0,
            ),
            present_count=row.present_count or 0,
            absent_count=row.absent_count or 0,
            late_count=row.late_count or 0,
        )
        for row in rows
    ]


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
    effective_class_id = _resolve_class_scope(current_user, class_id)

    grouped_subquery = _student_grouped_statement(
        effective_class_id=effective_class_id,
        search=search,
        roll_number=None,
        start_date=start_date,
        end_date=end_date,
    ).subquery()
    total = db.scalar(select(func.count()).select_from(grouped_subquery)) or 0
    rows = db.execute(select(grouped_subquery).offset((page - 1) * page_size).limit(page_size)).all()

    items = [_serialize_student_analytics(row, threshold) for row in rows]
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
        items.append(
            ClassAnalyticsRead(
                class_id=row.class_id,
                class_name=row.class_name,
                total_students=row.total_students or 0,
                present_count=row.present_count or 0,
                absent_count=row.absent_count or 0,
                late_count=row.late_count or 0,
                attendance_percentage=_attendance_percentage(
                    row.present_count or 0,
                    row.late_count or 0,
                    total_records,
                ),
            )
        )

    return ClassAnalyticsResponse(items=items)


async def get_attendance_summary(
    db: Session,
    current_user: User,
    *,
    attendance_date: date,
    class_id: int | None = None,
    threshold: float = 75.0,
) -> AnalyticsSummaryRead:
    effective_class_id = _resolve_class_scope(current_user, class_id)
    student_filters = []
    if effective_class_id is not None:
        student_filters.append(Student.class_id == effective_class_id)

    total_students = db.scalar(select(func.count(Student.id)).where(*student_filters)) or 0

    attendance_statement = (
        select(
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
        .select_from(Attendance)
        .join(Student, Student.roll_number == Attendance.roll_number)
        .where(Attendance.date == attendance_date, *student_filters)
    )
    row = db.execute(attendance_statement).one()

    analytics = get_student_analytics(
        db,
        current_user=current_user,
        class_id=effective_class_id,
        threshold=threshold,
        page=1,
        page_size=1000,
        end_date=attendance_date,
    )
    low_attendance_students = sum(1 for item in analytics.items if item.is_low_attendance)
    frequently_absent_students = sum(
        1
        for item in analytics.items
        if item.total_days and item.absent_count >= max(3, int(item.total_days * 0.25))
    )

    class_name = None
    if effective_class_id is not None:
        class_name = db.scalar(select(Classroom.name).where(Classroom.id == effective_class_id))

    summary = AnalyticsSummaryRead(
        attendance_date=attendance_date,
        class_id=effective_class_id,
        class_name=class_name,
        total_students=total_students,
        present_count=row.present_count or 0,
        absent_count=row.absent_count or 0,
        late_count=row.late_count or 0,
        attendance_percentage=_attendance_percentage(
            row.present_count or 0,
            row.late_count or 0,
            total_students,
        ),
        low_attendance_students=low_attendance_students,
        frequently_absent_students=frequently_absent_students,
        ai_summary="",
        used_fallback=True,
    )

    fallback_text = _rule_based_summary_text(summary)
    try:
        summary_text, used_fallback = await generate_natural_language_summary(
            title="Attendance summary",
            facts={
                "date": attendance_date.isoformat(),
                "class": class_name or "all classes",
                "total students": total_students,
                "present": summary.present_count,
                "absent": summary.absent_count,
                "late": summary.late_count,
                "attendance percentage": summary.attendance_percentage,
                "low attendance students": low_attendance_students,
                "frequently absent students": frequently_absent_students,
            },
            fallback_text=fallback_text,
        )
    except GroqServiceError:
        summary_text, used_fallback = fallback_text, True

    summary.ai_summary = summary_text
    summary.used_fallback = used_fallback
    return summary


async def get_student_insight(
    db: Session,
    current_user: User,
    *,
    roll_number: int,
    threshold: float = 75.0,
    start_date: date | None = None,
    end_date: date | None = None,
) -> StudentInsightRead:
    statement = (
        select(Student.roll_number, Student.name, Student.class_id, Classroom.name.label("class_name"))
        .select_from(Student)
        .outerjoin(Classroom, Classroom.id == Student.class_id)
        .where(Student.roll_number == roll_number)
    )
    if current_user.role == "teacher":
        statement = statement.where(Student.class_id == current_user.assigned_class_id)

    student_row = db.execute(statement).first()
    if not student_row:
        raise LookupError("Student not found.")

    student_rows = db.execute(
        select(
            _student_grouped_statement(
                effective_class_id=student_row.class_id,
                search=None,
                roll_number=roll_number,
                start_date=start_date,
                end_date=end_date,
            ).subquery()
        )
    ).all()
    if not student_rows:
        raise LookupError("Student analytics not found.")
    base_item = _serialize_student_analytics(student_rows[0], threshold)
    absent_percentage = round((base_item.absent_count / base_item.total_days) * 100, 2) if base_item.total_days else 0.0
    trend = _trend_for_scope(
        db,
        roll_number=roll_number,
        start_date=start_date,
        end_date=end_date,
    )

    student_insight = StudentInsightRead(
        roll_number=base_item.roll_number,
        name=base_item.name,
        class_id=base_item.class_id,
        class_name=base_item.class_name,
        total_days=base_item.total_days,
        present_count=base_item.present_count,
        absent_count=base_item.absent_count,
        late_count=base_item.late_count,
        attendance_percentage=base_item.attendance_percentage,
        absent_percentage=absent_percentage,
        is_low_attendance=base_item.is_low_attendance,
        frequent_absence=base_item.total_days > 0 and base_item.absent_count >= max(3, int(base_item.total_days * 0.25)),
        recent_trend=trend[-14:],
        ai_insight="",
        used_fallback=True,
    )

    fallback_text = _rule_based_student_insight(student_insight)
    try:
        insight_text, used_fallback = await generate_natural_language_summary(
            title="Student attendance insight",
            facts={
                "student": student_insight.name,
                "roll number": student_insight.roll_number,
                "class": student_insight.class_name or "unassigned",
                "attendance percentage": student_insight.attendance_percentage,
                "present count": student_insight.present_count,
                "absent count": student_insight.absent_count,
                "late count": student_insight.late_count,
            },
            fallback_text=fallback_text,
        )
    except GroqServiceError:
        insight_text, used_fallback = fallback_text, True

    student_insight.ai_insight = insight_text
    student_insight.used_fallback = used_fallback
    return student_insight


async def get_class_insight(
    db: Session,
    current_user: User,
    *,
    class_id: int,
    threshold: float = 75.0,
    start_date: date | None = None,
    end_date: date | None = None,
) -> ClassInsightRead:
    effective_class_id = _resolve_class_scope(current_user, class_id)
    class_row = db.execute(
        select(Classroom.id, Classroom.name).where(Classroom.id == effective_class_id)
    ).first()
    if not class_row:
        raise LookupError("Class not found.")

    class_analytics_response = get_class_analytics(
        db,
        current_user=current_user,
        start_date=start_date,
        end_date=end_date,
    )
    class_item = next((item for item in class_analytics_response.items if item.class_id == effective_class_id), None)
    if class_item is None:
        class_item = ClassAnalyticsRead(
            class_id=class_row.id,
            class_name=class_row.name,
            total_students=0,
            present_count=0,
            absent_count=0,
            late_count=0,
            attendance_percentage=0.0,
        )

    low_students = get_student_analytics(
        db,
        current_user=current_user,
        class_id=effective_class_id,
        threshold=threshold,
        page=1,
        page_size=100,
        start_date=start_date,
        end_date=end_date,
    )
    low_attendance_students = [item for item in low_students.items if item.is_low_attendance][:10]
    trend = _trend_for_scope(
        db,
        class_id=effective_class_id,
        start_date=start_date,
        end_date=end_date,
    )

    insight = ClassInsightRead(
        class_id=class_item.class_id,
        class_name=class_item.class_name,
        total_students=class_item.total_students,
        present_count=class_item.present_count,
        absent_count=class_item.absent_count,
        late_count=class_item.late_count,
        attendance_percentage=class_item.attendance_percentage,
        trend=trend,
        low_attendance_students=low_attendance_students,
        ai_insight="",
        used_fallback=True,
    )

    fallback_text = _rule_based_class_insight(insight)
    try:
        insight_text, used_fallback = await generate_natural_language_summary(
            title="Class attendance insight",
            facts={
                "class": insight.class_name,
                "total students": insight.total_students,
                "present count": insight.present_count,
                "absent count": insight.absent_count,
                "late count": insight.late_count,
                "attendance percentage": insight.attendance_percentage,
                "low attendance students": len(insight.low_attendance_students),
            },
            fallback_text=fallback_text,
        )
    except GroqServiceError:
        insight_text, used_fallback = fallback_text, True

    insight.ai_insight = insight_text
    insight.used_fallback = used_fallback
    return insight


def get_predictions(
    db: Session,
    current_user: User,
    *,
    class_id: int | None = None,
    threshold: float = 75.0,
) -> PredictionsResponse:
    effective_class_id = _resolve_class_scope(current_user, class_id)
    all_students = get_student_analytics(
        db,
        current_user=current_user,
        class_id=effective_class_id,
        threshold=threshold,
        page=1,
        page_size=1000,
    ).items

    recent_start_date = date.today() - timedelta(days=13)
    recent_rows = get_student_analytics(
        db,
        current_user=current_user,
        class_id=effective_class_id,
        threshold=threshold,
        page=1,
        page_size=1000,
        start_date=recent_start_date,
    ).items
    recent_map = {item.roll_number: item for item in recent_rows}

    predictions: list[PredictionRead] = []
    for item in all_students:
        recent_item = recent_map.get(item.roll_number)
        recent_attendance_percentage = recent_item.attendance_percentage if recent_item else item.attendance_percentage
        risk_score, risk_level, explanation = _prediction_risk(item, recent_attendance_percentage, threshold)
        if risk_level == "low":
            continue

        predictions.append(
            PredictionRead(
                roll_number=item.roll_number,
                name=item.name,
                class_id=item.class_id,
                class_name=item.class_name,
                attendance_percentage=item.attendance_percentage,
                total_days=item.total_days,
                absent_count=item.absent_count,
                recent_attendance_percentage=recent_attendance_percentage,
                risk_score=risk_score,
                risk_level=risk_level,
                explanation=explanation,
            )
        )

    predictions.sort(key=lambda item: (-item.risk_score, item.attendance_percentage, item.roll_number))
    return PredictionsResponse(items=predictions)
