from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class Student(Base):
    __tablename__ = "students"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    roll_number: Mapped[int] = mapped_column(Integer, unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    attendance_records = relationship(
        "Attendance",
        back_populates="student",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
