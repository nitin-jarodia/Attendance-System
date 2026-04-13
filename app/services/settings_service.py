import json
from datetime import date, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.activity_log import ActivityLog
from app.models.attendance import Attendance
from app.models.reset_snapshot import ResetSnapshot
from app.models.user import User
from app.schemas.settings import ActivityLogRead, ActivityLogResponse, ResetResponse


UNDO_WINDOW_SECONDS = 10


def _serialize_attendance_records(records: list[Attendance]) -> str:
    payload = [
        {
            "roll_number": record.roll_number,
            "date": record.date.isoformat(),
            "status": record.status,
        }
        for record in records
    ]
    return json.dumps(payload)


def _log_activity(db: Session, actor_username: str, action: str, details: str) -> None:
    db.add(ActivityLog(actor_username=actor_username, action=action, details=details))


def reset_attendance_for_date(db: Session, *, actor: User, target_date: date) -> ResetResponse:
    records = list(db.scalars(select(Attendance).where(Attendance.date == target_date)).all())
    snapshot = ResetSnapshot(
        actor_username=actor.username,
        scope="day",
        target_date=target_date.isoformat(),
        snapshot_data=_serialize_attendance_records(records),
        expires_at=datetime.utcnow() + timedelta(seconds=UNDO_WINDOW_SECONDS),
    )
    db.add(snapshot)

    if records:
        db.execute(delete(Attendance).where(Attendance.date == target_date))

    _log_activity(
        db,
        actor.username,
        "reset_day",
        f"Reset attendance data for {target_date.isoformat()} ({len(records)} records removed).",
    )
    db.commit()
    db.refresh(snapshot)

    return ResetResponse(
        message=f"Data for {target_date.isoformat()} has been reset successfully.",
        snapshot_id=snapshot.id,
        target_date=target_date,
        undo_expires_at=snapshot.expires_at,
        deleted_records=len(records),
    )


def reset_all_attendance(db: Session, *, actor: User, confirmation_text: str) -> ResetResponse:
    if confirmation_text.strip().upper() != "RESET":
        raise ValueError("Type RESET to confirm resetting all data.")

    records = list(db.scalars(select(Attendance)).all())
    snapshot = ResetSnapshot(
        actor_username=actor.username,
        scope="all",
        target_date=None,
        snapshot_data=_serialize_attendance_records(records),
        expires_at=datetime.utcnow() + timedelta(seconds=UNDO_WINDOW_SECONDS),
    )
    db.add(snapshot)

    if records:
        db.execute(delete(Attendance))

    _log_activity(
        db,
        actor.username,
        "reset_all",
        f"Reset all attendance data ({len(records)} records removed).",
    )
    db.commit()
    db.refresh(snapshot)

    return ResetResponse(
        message="All attendance data has been reset successfully.",
        snapshot_id=snapshot.id,
        target_date=None,
        undo_expires_at=snapshot.expires_at,
        deleted_records=len(records),
    )


def undo_reset(db: Session, *, actor: User, snapshot_id: int) -> ResetResponse:
    snapshot = db.scalar(select(ResetSnapshot).where(ResetSnapshot.id == snapshot_id))
    if snapshot is None:
        raise LookupError("Undo snapshot not found.")
    if snapshot.restored_at is not None:
        raise ValueError("This reset has already been undone.")
    if snapshot.expires_at < datetime.utcnow():
        raise ValueError("Undo window has expired for this reset.")

    payload = json.loads(snapshot.snapshot_data)
    restored_count = 0
    for item in payload:
        record_date = date.fromisoformat(item["date"])
        existing = db.scalar(
            select(Attendance).where(
                Attendance.roll_number == item["roll_number"],
                Attendance.date == record_date,
            )
        )
        if existing:
            existing.status = item["status"]
        else:
            db.add(
                Attendance(
                    roll_number=item["roll_number"],
                    date=record_date,
                    status=item["status"],
                )
            )
        restored_count += 1

    snapshot.restored_at = datetime.utcnow()
    _log_activity(
        db,
        actor.username,
        "undo_reset",
        f"Restored {restored_count} attendance records from reset snapshot #{snapshot_id}.",
    )
    db.commit()

    return ResetResponse(
        message="Reset has been undone successfully.",
        snapshot_id=snapshot.id,
        target_date=date.fromisoformat(snapshot.target_date) if snapshot.target_date else None,
        undo_expires_at=snapshot.expires_at,
        deleted_records=restored_count,
    )


def get_activity_log(db: Session, *, limit: int = 50) -> ActivityLogResponse:
    rows = list(
        db.scalars(select(ActivityLog).order_by(ActivityLog.created_at.desc()).limit(limit)).all()
    )
    return ActivityLogResponse(
        items=[
            ActivityLogRead(
                id=row.id,
                actor_username=row.actor_username,
                action=row.action,
                details=row.details,
                created_at=row.created_at,
            )
            for row in rows
        ]
    )
