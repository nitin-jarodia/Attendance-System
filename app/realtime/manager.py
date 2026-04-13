from dataclasses import dataclass
from datetime import datetime

from fastapi import WebSocket

from app.schemas.analytics import RealtimeAttendanceEvent


@dataclass
class RealtimeConnection:
    websocket: WebSocket
    role: str
    assigned_class_id: int | None


class AttendanceRealtimeManager:
    def __init__(self) -> None:
        self._connections: list[RealtimeConnection] = []

    async def connect(self, websocket: WebSocket, role: str, assigned_class_id: int | None) -> None:
        await websocket.accept()
        self._connections.append(
            RealtimeConnection(
                websocket=websocket,
                role=role,
                assigned_class_id=assigned_class_id,
            )
        )

    def disconnect(self, websocket: WebSocket) -> None:
        self._connections = [
            connection for connection in self._connections if connection.websocket is not websocket
        ]

    async def broadcast(self, event: RealtimeAttendanceEvent) -> None:
        disconnected: list[WebSocket] = []
        payload = {
            "type": event.type,
            "action": event.action,
            "attendance_date": event.attendance_date.isoformat(),
            "class_ids": event.class_ids,
            "roll_numbers": event.roll_numbers,
            "message": event.message,
            "updated_at": event.updated_at.isoformat(),
        }

        for connection in self._connections:
            if connection.role == "teacher" and connection.assigned_class_id not in event.class_ids:
                continue
            try:
                await connection.websocket.send_json(payload)
            except Exception:
                disconnected.append(connection.websocket)

        for websocket in disconnected:
            self.disconnect(websocket)

    async def emit_attendance_event(
        self,
        *,
        action: str,
        attendance_date,
        class_ids: list[int | None],
        roll_numbers: list[int],
        message: str,
    ) -> None:
        filtered_class_ids = sorted({class_id for class_id in class_ids if class_id is not None})
        await self.broadcast(
            RealtimeAttendanceEvent(
                type="attendance_updated",
                action=action,
                attendance_date=attendance_date,
                class_ids=filtered_class_ids,
                roll_numbers=sorted(set(roll_numbers)),
                message=message,
                updated_at=datetime.utcnow(),
            )
        )


attendance_realtime_manager = AttendanceRealtimeManager()
