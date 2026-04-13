from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status

from app.auth.security import decode_access_token
from app.db.database import SessionLocal
from app.models.user import User
from app.realtime.manager import attendance_realtime_manager


router = APIRouter(tags=["realtime"])


@router.websocket("/realtime/attendance")
async def attendance_updates(websocket: WebSocket, token: str = Query(...)) -> None:
    try:
        payload = decode_access_token(token)
        username = payload.get("sub")
        if not username:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    with SessionLocal() as db:
        user = db.query(User).filter(User.username == username).first()
        if not user:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        await attendance_realtime_manager.connect(
            websocket,
            role=user.role,
            assigned_class_id=user.assigned_class_id,
        )

    try:
        await websocket.send_json({"type": "connected", "message": "Realtime attendance updates enabled."})
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        attendance_realtime_manager.disconnect(websocket)
    except Exception:
        attendance_realtime_manager.disconnect(websocket)
