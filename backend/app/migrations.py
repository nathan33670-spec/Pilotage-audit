"""Migrations légères appliquées au démarrage.

Le projet n'embarque volontairement pas Alembic : le schéma est créé par
`Base.metadata.create_all()`. Cette fonction complète ce mécanisme pour les
bases **déjà existantes**, en ajoutant de façon idempotente les colonnes et les
index apparus avec les nouvelles fonctionnalités (kanban configurable, temps
réels, champs personnalisés, import en masse).

Toutes les opérations sont sûres à rejouer : elles vérifient l'état réel du
schéma avant d'émettre du DDL.
"""

import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.database import Base
from app.models import Audit, AuditStatus, AppSetting, KanbanColumn

logger = logging.getLogger("uvicorn")

# table -> [(colonne, DDL du type)]
ADDED_COLUMNS: dict[str, list[tuple[str, str]]] = {
    "categories": [
        ("code", "VARCHAR(50)"),
        ("color", "VARCHAR(20)"),
        ("default_duration_days", "INTEGER"),
        ("position", "INTEGER DEFAULT 0"),
    ],
    "audits": [
        ("reference", "VARCHAR(100)"),
        ("kanban_column_id", "VARCHAR(36)"),
        ("actual_start", "DATE"),
        ("actual_end", "DATE"),
        ("estimated_days", "NUMERIC(6,2)"),
        ("import_batch_id", "VARCHAR(36)"),
    ],
    "audit_phases": [
        ("actual_start_date", "DATE"),
        ("actual_end_date", "DATE"),
    ],
}

# Colonnes du kanban par défaut : reprend le cycle de vie historique des audits
DEFAULT_KANBAN_COLUMNS = [
    ("brouillon", "Brouillon", "#9e9e9e", AuditStatus.BROUILLON, True, False),
    ("planifie", "Planifié", "#42a5f5", AuditStatus.PLANIFIE, False, False),
    ("en_cours", "En cours", "#7e57c2", AuditStatus.EN_COURS, False, False),
    ("en_attente", "En attente", "#ffb300", AuditStatus.EN_ATTENTE, False, False),
    ("bloque", "Bloqué", "#e53935", AuditStatus.BLOQUE, False, False),
    ("termine", "Terminé", "#43a047", AuditStatus.TERMINE, False, True),
    ("annule", "Annulé", "#616161", AuditStatus.ANNULE, False, True),
]

DEFAULT_SETTINGS: dict[str, dict] = {
    "kanban": {
        "card_fields": ["category", "tags", "pilot", "company", "dates", "priority"],
        "color_by": "priority",          # priority | status | category
        "show_wip_limit": True,
        "show_empty_columns": True,
        "allow_drag_and_drop": True,
        "title": "Kanban des audits",
    },
    "planning": {
        "default_scale": "mois",         # jour | semaine | mois | trimestre | annee | cycle
        "cycle_years": 3,
        "week_start_monday": True,
        "highlight_weekends": True,
    },
}


def _add_missing_columns(engine: Engine) -> None:
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    with engine.begin() as connection:
        for table, columns in ADDED_COLUMNS.items():
            if table not in existing_tables:
                continue  # create_all() l'a créée avec le schéma complet
            present = {c["name"] for c in inspector.get_columns(table)}
            for name, ddl_type in columns:
                if name in present:
                    continue
                logger.info("Migration: ajout de %s.%s", table, name)
                connection.execute(text(f'ALTER TABLE {table} ADD COLUMN {name} {ddl_type}'))


def _create_missing_indexes(engine: Engine) -> None:
    """`create_all` ne crée les index que pour les tables nouvellement créées."""
    for table in Base.metadata.sorted_tables:
        for index in table.indexes:
            try:
                index.create(bind=engine, checkfirst=True)
            except Exception as exc:  # pragma: no cover - index déjà présent sous un autre nom
                logger.debug("Index %s non créé: %s", index.name, exc)


def _seed_kanban_columns(db: Session) -> None:
    if db.query(KanbanColumn).count() > 0:
        return
    for position, (key, label, color, status, is_default, is_final) in enumerate(DEFAULT_KANBAN_COLUMNS):
        db.add(
            KanbanColumn(
                key=key,
                label=label,
                color=color,
                position=position,
                mapped_status=status,
                is_default=is_default,
                is_final=is_final,
            )
        )
    db.commit()
    logger.info("Colonnes kanban par défaut créées (%d)", len(DEFAULT_KANBAN_COLUMNS))


def _seed_settings(db: Session) -> None:
    for key, value in DEFAULT_SETTINGS.items():
        setting = db.get(AppSetting, key)
        if setting is None:
            db.add(AppSetting(key=key, value=value))
        else:
            # complète les clés ajoutées par une nouvelle version sans écraser les choix de l'admin
            merged = {**value, **(setting.value or {})}
            if merged != setting.value:
                setting.value = merged
    db.commit()


def _attach_audits_to_columns(db: Session) -> None:
    """Rattache les audits existants (ou importés sans colonne) à la colonne
    kanban correspondant à leur statut."""
    columns = {c.mapped_status: c for c in db.query(KanbanColumn).all() if c.mapped_status is not None}
    if not columns:
        return
    fallback = (
        db.query(KanbanColumn).filter(KanbanColumn.is_default.is_(True)).first()
        or db.query(KanbanColumn).order_by(KanbanColumn.position).first()
    )
    orphans = db.query(Audit).filter(Audit.kanban_column_id.is_(None)).all()
    if not orphans:
        return
    for audit in orphans:
        column = columns.get(audit.status, fallback)
        if column is not None:
            audit.kanban_column_id = column.id
    db.commit()
    logger.info("%d audit(s) rattaché(s) à une colonne kanban", len(orphans))


def run_migrations(engine: Engine, session_factory) -> None:
    _add_missing_columns(engine)
    Base.metadata.create_all(bind=engine)
    _create_missing_indexes(engine)

    db = session_factory()
    try:
        _seed_kanban_columns(db)
        _seed_settings(db)
        _attach_audits_to_columns(db)
    finally:
        db.close()
