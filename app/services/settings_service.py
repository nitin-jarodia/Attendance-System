import json
from datetime import date, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.attendance import Attendance
from app.models.reset_snapshot import ResetSnapshot
from app.models.user import User
from app.schemas.settings import ActivityLogRead, ActivityLogResponse, ResetResponse
from app.services.activity_service import get_activity_logs, log_activity


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

    log_activity(
        db,
        action_type="DATA_RESET",
        user=actor,
        details=f"Reset attendance data for {target_date.isoformat()} ({len(records)} records removed).",
        target_type="attendance",
        target_name=target_date.isoformat(),
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

    log_activity(
        db,
        action_type="DATA_RESET",
        user=actor,
        details=f"Reset all attendance data ({len(records)} records removed).",
        target_type="attendance",
        target_name="all",
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
    log_activity(
        db,
        action_type="DATA_RESET",
        user=actor,
        details=f"Restored {restored_count} attendance records from reset snapshot #{snapshot_id}.",
        target_type="attendance",
        target_name=f"snapshot-{snapshot_id}",
    )
    db.commit()

    return ResetResponse(
        message="Reset has been undone successfully.",
        snapshot_id=snapshot.id,
        target_date=date.fromisoformat(snapshot.target_date) if snapshot.target_date else None,
        undo_expires_at=snapshot.expires_at,
        deleted_records=restored_count,
    )


def get_activity_log(
    db: Session,
    *,
    action_type: str | None = None,
    performer_name: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> ActivityLogResponse:
    rows, total = get_activity_logs(
        db,
        action_type=action_type,
        performer_name=performer_name,
        page=page,
        page_size=page_size,
    )
    return ActivityLogResponse(
        items=[
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
        ],
        total=total,
        page=page,
        page_size=page_size,
    )
