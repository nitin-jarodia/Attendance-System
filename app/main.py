from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import OperationalError

from app.core.config import get_settings
from app.db.database import Base, engine
from app.routes.attendance_routes import router as attendance_router
from app.routes.student_routes import router as student_router


settings = get_settings()
frontend_dir = Path(__file__).resolve().parent.parent / "frontend"


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        Base.metadata.create_all(bind=engine)
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

app.include_router(student_router)
app.include_router(attendance_router)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/", include_in_schema=False)
def root() -> RedirectResponse:
    return RedirectResponse(url="/students.html")


app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
