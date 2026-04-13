from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.activity_log import ActivityLog
from app.models.user import User


def log_activity(
    db: Session,
    *,
    action_type: str,
    user: User,
    details: str,
    target_type: str | None = None,
    target_id: int | None = None,
    target_name: str | None = None,
    previous_value: str | None = None,
    new_value: str | None = None,
) -> None:
    db.add(
        ActivityLog(
            action_type=action_type,
            performed_by=user.id,
            performer_name=user.username,
            performer_role=user.role,
            target_type=target_type,
            target_id=target_id,
            target_name=target_name,
            details=details,
            previous_value=previous_value,
            new_value=new_value,
            actor_username=user.username,
            action=action_type,
        )
    )


def get_activity_logs(
    db: Session,
    *,
    action_type: str | None = None,
    performer_name: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[ActivityLog], int]:
    filters = []
    if action_type:
        filters.append(ActivityLog.action_type == action_type)
    if performer_name:
        filters.append(ActivityLog.performer_name == performer_name)

    total = db.scalar(
        select(func.count(ActivityLog.id)).where(*filters)
    ) or 0

    rows = list(
        db.scalars(
            select(ActivityLog)
            .where(*filters)
            .order_by(ActivityLog.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
    )
    return rows, total


def get_recent_activity(db: Session, *, limit: int = 5) -> list[ActivityLog]:
    return list(
        db.scalars(
            select(ActivityLog)
            .order_by(ActivityLog.created_at.desc())
            .limit(limit)
        ).all()
    )
