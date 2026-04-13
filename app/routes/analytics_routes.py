from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.db.database import get_db
from app.models.user import User
from app.schemas.analytics import ClassAnalyticsResponse, StudentAnalyticsResponse
from app.services.analytics_service import get_class_analytics, get_student_analytics


router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/students", response_model=StudentAnalyticsResponse)
def student_analytics(
    class_id: int | None = Query(default=None, gt=0),
    search: str | None = Query(default=None),
    threshold: float = Query(default=75.0, ge=0, le=100),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StudentAnalyticsResponse:
    try:
        return get_student_analytics(
            db,
            current_user=current_user,
            class_id=class_id,
            search=search,
            threshold=threshold,
            page=page,
            page_size=page_size,
            start_date=start_date,
            end_date=end_date,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get("/classes", response_model=ClassAnalyticsResponse)
def class_analytics(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ClassAnalyticsResponse:
    return get_class_analytics(
        db,
        current_user=current_user,
        start_date=start_date,
        end_date=end_date,
    )
