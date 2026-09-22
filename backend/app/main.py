import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import Base, SessionLocal, engine
from app.migrations import run_migrations
from app.models import AuthProvider, User, UserRole
from app.routers import (
    admin,
    audits,
    auth,
    categories,
    documents,
    imports,
    phase_templates,
    planning,
    prestations,
    stats,
    templates,
    users,
)
from app.security import hash_password

logger = logging.getLogger("uvicorn")
settings = get_settings()

APP_VERSION = "1.1.0"

app = FastAPI(
    title=settings.app_name,
    description=(
        "API de pilotage des audits / tests d'intrusion : planification multi-échelles, "
        "kanban configurable, statistiques de charge et de durée, import en masse."
    ),
    version=APP_VERSION,
)

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
app.include_router(phase_templates.router)
app.include_router(prestations.router)
app.include_router(audits.router)
app.include_router(planning.router)
app.include_router(documents.router)
app.include_router(admin.kanban_router)
app.include_router(admin.settings_router)
app.include_router(admin.custom_fields_router)
app.include_router(admin.tags_router)
app.include_router(stats.router)
app.include_router(imports.router)


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
    # Complète le schéma des bases existantes (nouvelles colonnes/index) puis
    # installe les données de référence (colonnes kanban, paramètres).
    run_migrations(engine, SessionLocal)
    os.makedirs(settings.uploads_dir, exist_ok=True)
    _bootstrap_admin()


@app.get("/api/health")
def health_check():
    return {"status": "ok", "version": APP_VERSION}


@app.get("/api/version")
def version() -> dict:
    return {"name": settings.app_name, "version": APP_VERSION, "environment": settings.environment}
