from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class ResetSnapshot(Base):
    __tablename__ = "reset_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    actor_username: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    scope: Mapped[str] = mapped_column(String(50), nullable=False)
    target_date: Mapped[str | None] = mapped_column(String(20), nullable=True)
    snapshot_data: Mapped[str] = mapped_column(Text, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    restored_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
    )
