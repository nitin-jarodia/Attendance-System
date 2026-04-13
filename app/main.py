from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import OperationalError

from app import models  # noqa: F401
from app.core.config import get_settings
from app.db.bootstrap import ensure_database_schema
from app.db.database import Base, engine
from app.db.database import SessionLocal
from app.routes.analytics_routes import router as analytics_router
from app.routes.auth_routes import router as auth_router
from app.routes.attendance_routes import router as attendance_router
from app.routes.class_routes import router as class_router
from app.routes.dashboard_routes import router as dashboard_router
from app.routes.student_routes import router as student_router
from app.services.auth_service import ensure_default_admin


settings = get_settings()
frontend_dir = Path(__file__).resolve().parent.parent / "frontend"


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        Base.metadata.create_all(bind=engine)
        ensure_database_schema(engine)
        with SessionLocal() as db:
            ensure_default_admin(db)
    except OperationalError as exc:
        raise RuntimeError(
            "Database connection failed. Ensure the MySQL service is running and that "
            "the credentials in .env are correct before starting the FastAPI server."
        ) from exc
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(class_router)
app.include_router(dashboard_router)
app.include_router(analytics_router)
app.include_router(student_router)
app.include_router(attendance_router)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/", include_in_schema=False)
def root() -> RedirectResponse:
    return RedirectResponse(url="/dashboard.html")


app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
