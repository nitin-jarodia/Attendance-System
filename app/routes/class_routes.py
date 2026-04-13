from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user, require_admin
from app.db.database import get_db
from app.models.user import User
from app.schemas.classroom import ClassCreate, ClassRead, ClassUpdate
from app.services.class_service import create_class, delete_class, list_classes, update_class


router = APIRouter(prefix="/classes", tags=["classes"])


@router.get("", response_model=list[ClassRead])
def get_classes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ClassRead]:
    return list_classes(db, current_user)


@router.post("", response_model=ClassRead, status_code=status.HTTP_201_CREATED)
def create_class_route(
    payload: ClassCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> ClassRead:
    try:
        return create_class(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.put("/{class_id}", response_model=ClassRead)
def update_class_route(
    class_id: int,
    payload: ClassUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> ClassRead:
    try:
        return update_class(db, class_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete("/{class_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_class_route(
    class_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> None:
    try:
        delete_class(db, class_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
