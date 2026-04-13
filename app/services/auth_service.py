from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.security import create_access_token, hash_password, verify_password
from app.core.config import get_settings
from app.models.classroom import Classroom
from app.models.user import User
from app.schemas.auth import CurrentUserRead, LoginRequest, TokenResponse, UserCreate, UserRead


def serialize_user(user: User) -> CurrentUserRead:
    return CurrentUserRead(
        id=user.id,
        username=user.username,
        role=user.role,
        assigned_class_id=user.assigned_class_id,
        assigned_class_name=user.assigned_class.name if user.assigned_class else None,
    )


def authenticate_user(db: Session, payload: LoginRequest) -> TokenResponse:
    user = db.scalar(select(User).where(User.username == payload.username))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise ValueError("Invalid username or password.")

    token = create_access_token(subject=user.username, extra_claims={"role": user.role})
    return TokenResponse(access_token=token, user=serialize_user(user))


def ensure_default_admin(db: Session) -> None:
    has_users = db.scalar(select(func.count(User.id))) or 0
    if has_users:
        return

    settings = get_settings()
    default_admin = User(
        username=settings.bootstrap_admin_username.strip().lower(),
        password_hash=hash_password(settings.bootstrap_admin_password),
        role="admin",
    )
    db.add(default_admin)
    db.commit()


def list_users(db: Session) -> list[UserRead]:
    statement = (
        select(User, Classroom.name.label("class_name"))
        .outerjoin(Classroom, Classroom.id == User.assigned_class_id)
        .order_by(User.created_at.desc(), User.username.asc())
    )
    rows = db.execute(statement).all()
    return [
        UserRead(
            id=row.User.id,
            username=row.User.username,
            role=row.User.role,
            assigned_class_id=row.User.assigned_class_id,
            assigned_class_name=row.class_name,
            created_at=row.User.created_at,
        )
        for row in rows
    ]


def create_user(db: Session, payload: UserCreate) -> UserRead:
    if payload.role.value == "teacher" and payload.assigned_class_id is None:
        raise ValueError("Teacher accounts must be assigned to a class.")

    class_name = None
    if payload.assigned_class_id is not None:
        classroom = db.scalar(select(Classroom).where(Classroom.id == payload.assigned_class_id))
        if classroom is None:
            raise ValueError("Assigned class was not found.")
        class_name = classroom.name

    user = User(
        username=payload.username,
        password_hash=hash_password(payload.password),
        role=payload.role.value,
        assigned_class_id=payload.assigned_class_id,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ValueError("A user with this username already exists.") from exc

    db.refresh(user)
    return UserRead(
        id=user.id,
        username=user.username,
        role=user.role,
        assigned_class_id=user.assigned_class_id,
        assigned_class_name=class_name,
        created_at=user.created_at,
    )
