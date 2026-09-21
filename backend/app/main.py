import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import Base, SessionLocal, engine
from app.models import AuthProvider, User, UserRole
from app.routers import audits, auth, categories, documents, planning, prestations, templates, users
from app.security import hash_password

logger = logging.getLogger("uvicorn")
settings = get_settings()

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(categories.router)
app.include_router(templates.router)
app.include_router(prestations.router)
app.include_router(audits.router)
app.include_router(planning.router)
app.include_router(documents.router)


def _bootstrap_admin() -> None:
    """Crée un compte admin par défaut si aucun utilisateur n'existe encore."""
    db = SessionLocal()
    try:
        if db.query(User).count() > 0:
            return
        admin_email = os.getenv("ADMIN_EMAIL", "admin@pilotage-audit.local")
        admin_password = os.getenv("ADMIN_PASSWORD", "ChangeMe123!")
        admin = User(
            email=admin_email,
            full_name="Administrateur",
            role=UserRole.ADMIN,
            auth_provider=AuthProvider.LOCAL,
            hashed_password=hash_password(admin_password),
        )
        db.add(admin)
        db.commit()
        logger.warning("Compte admin par défaut créé: %s (changez le mot de passe immédiatement)", admin_email)
    finally:
        db.close()


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)
    os.makedirs(settings.uploads_dir, exist_ok=True)
    _bootstrap_admin()


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
