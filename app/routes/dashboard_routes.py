from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.db.database import get_db
from app.models.user import User
from app.schemas.dashboard import DashboardSummaryRead
from app.schemas.holiday import UpcomingHolidayRead
from app.schemas.settings import ActivityLogRead
from app.services.activity_service import get_recent_activity
from app.services.dashboard_service import get_dashboard_summary
from app.services.holiday_service import get_upcoming_holidays


router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummaryRead)
def dashboard_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DashboardSummaryRead:
    return get_dashboard_summary(db, current_user)


@router.get("/recent-activity", response_model=list[ActivityLogRead])
def recent_activity(
    limit: int = Query(default=5, ge=1, le=20),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[ActivityLogRead]:
    rows = get_recent_activity(db, limit=limit)
    return [
        ActivityLogRead(
            id=row.id,
            action_type=row.action_type or row.action or "",
            performed_by=row.performed_by or 0,
            performer_name=row.performer_name or row.actor_username or "",
            performer_role=row.performer_role,
            target_type=row.target_type,
            target_id=row.target_id,
            target_name=row.target_name,
            details=row.details,
            previous_value=row.previous_value,
            new_value=row.new_value,
            created_at=row.created_at,
        )
        for row in rows
    ]


@router.get("/upcoming-holidays", response_model=list[UpcomingHolidayRead])
def dashboard_upcoming_holidays(
    limit: int = Query(default=3, ge=1, le=10),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[UpcomingHolidayRead]:
    return get_upcoming_holidays(db, limit=limit)
