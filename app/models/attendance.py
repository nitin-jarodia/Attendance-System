from datetime import date

from sqlalchemy import Date, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class Attendance(Base):
    __tablename__ = "attendance"
    __table_args__ = (UniqueConstraint("roll_number", "date", name="uq_attendance_roll_date"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    roll_number: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("students.roll_number", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False)

    student = relationship("Student", back_populates="attendance_records")
