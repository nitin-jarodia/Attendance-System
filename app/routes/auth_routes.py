from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user, require_admin
from app.auth.security import create_access_token
from app.db.database import get_db
from app.models.user import User
from app.schemas.auth import CurrentUserRead, LoginRequest, TokenResponse, UserCreate, UserRead
from app.services.auth_service import authenticate_user, create_user, list_users, serialize_user


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    try:
        return authenticate_user(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc


@router.get("/me", response_model=CurrentUserRead)
def get_me(current_user: User = Depends(get_current_user)) -> CurrentUserRead:
    return serialize_user(current_user)


@router.get("/users", response_model=list[UserRead])
def get_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> list[UserRead]:
    return list_users(db)


@router.post("/users", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_user_route(
    payload: UserCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> UserRead:
    try:
        return create_user(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/demo-switch", response_model=TokenResponse)
def demo_role_switch(
    role: str = Body(..., embed=True),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TokenResponse:
    """Demo-only: re-issue a token with the specified role for testing different views."""
    allowed_roles = {"admin", "teacher", "principal"}
    if role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Role must be one of: {', '.join(sorted(allowed_roles))}",
        )
    current_user.role = role
    db.commit()
    db.refresh(current_user)
    token = create_access_token(subject=current_user.username, extra_claims={"role": role})
    return TokenResponse(access_token=token, user=serialize_user(current_user))
