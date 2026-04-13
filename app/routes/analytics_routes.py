from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.db.database import get_db
from app.models.user import User
from app.schemas.analytics import (
    AnalyticsSummaryRead,
    ClassAnalyticsResponse,
    ClassInsightRead,
    PredictionsResponse,
    StudentAnalyticsResponse,
    StudentInsightRead,
)
from app.services.analytics_service import (
    get_attendance_summary,
    get_class_analytics,
    get_class_insight,
    get_predictions,
    get_student_analytics,
    get_student_insight,
)


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


@router.get("/summary", response_model=AnalyticsSummaryRead)
async def analytics_summary(
    attendance_date: date | None = Query(default=None, alias="date"),
    class_id: int | None = Query(default=None, gt=0),
    threshold: float = Query(default=75.0, ge=0, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AnalyticsSummaryRead:
    try:
        return await get_attendance_summary(
            db,
            current_user=current_user,
            attendance_date=attendance_date or date.today(),
            class_id=class_id,
            threshold=threshold,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get("/student/{roll_number}", response_model=StudentInsightRead)
async def student_insight(
    roll_number: int,
    threshold: float = Query(default=75.0, ge=0, le=100),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StudentInsightRead:
    try:
        return await get_student_insight(
            db,
            current_user=current_user,
            roll_number=roll_number,
            threshold=threshold,
            start_date=start_date,
            end_date=end_date,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/class/{class_id}", response_model=ClassInsightRead)
async def class_insight(
    class_id: int,
    threshold: float = Query(default=75.0, ge=0, le=100),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ClassInsightRead:
    try:
        return await get_class_insight(
            db,
            current_user=current_user,
            class_id=class_id,
            threshold=threshold,
            start_date=start_date,
            end_date=end_date,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/predictions", response_model=PredictionsResponse)
def prediction_analytics(
    class_id: int | None = Query(default=None, gt=0),
    threshold: float = Query(default=75.0, ge=0, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PredictionsResponse:
    try:
        return get_predictions(
            db,
            current_user=current_user,
            class_id=class_id,
            threshold=threshold,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
