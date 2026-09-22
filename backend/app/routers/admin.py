"""Panneau d'administration : kanban configurable, étiquettes, champs
personnalisés et paramètres d'affichage.

Tout ce qui structure l'outil (colonnes du kanban, catégories, étiquettes,
champs additionnels) est modifiable en ligne par un administrateur : aucune
modification de code n'est nécessaire pour adapter le workflow.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, require_admin
from app.models import (
    Audit,
    AuditCustomValue,
    AppSetting,
    CustomFieldDefinition,
    KanbanColumn,
    Tag,
    User,
)
from app.schemas import (
    AppSettingOut,
    AppSettingUpdate,
    CustomFieldCreate,
    CustomFieldOut,
    CustomFieldUpdate,
    KanbanColumnCreate,
    KanbanColumnOut,
    KanbanColumnUpdate,
    KanbanReorder,
    TagCreate,
    TagOut,
    TagUpdate,
)

kanban_router = APIRouter(prefix="/api/kanban", tags=["kanban"])
settings_router = APIRouter(prefix="/api/settings", tags=["settings"])
custom_fields_router = APIRouter(prefix="/api/custom-fields", tags=["custom-fields"])
tags_router = APIRouter(prefix="/api/tags", tags=["tags"])


# ---------------------------------------------------------------------------
# Kanban
# ---------------------------------------------------------------------------
def _columns_with_counts(db: Session, include_inactive: bool = False) -> list[KanbanColumnOut]:
    query = db.query(KanbanColumn)
    if not include_inactive:
        query = query.filter(KanbanColumn.is_active.is_(True))
    columns = query.order_by(KanbanColumn.position, KanbanColumn.label).all()
    counts = dict(
        db.query(Audit.kanban_column_id, func.count(Audit.id))
        .filter(Audit.kanban_column_id.isnot(None))
        .group_by(Audit.kanban_column_id)
        .all()
    )
    return [
        KanbanColumnOut(**{
            **{c: getattr(column, c) for c in (
                "id", "key", "label", "description", "color", "position",
                "wip_limit", "mapped_status", "is_default", "is_final", "is_active",
            )},
            "audits_count": counts.get(column.id, 0),
        })
        for column in columns
    ]


@kanban_router.get("/columns", response_model=list[KanbanColumnOut])
def list_kanban_columns(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return _columns_with_counts(db, include_inactive)


@kanban_router.post("/columns", response_model=KanbanColumnOut, status_code=201)
def create_kanban_column(
    payload: KanbanColumnCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)
):
    if db.query(KanbanColumn).filter(KanbanColumn.key == payload.key).first():
        raise HTTPException(status_code=400, detail="Une colonne avec cette clé existe déjà")
    data = payload.model_dump()
    if data.get("position") in (None, 0):
        data["position"] = (db.query(func.max(KanbanColumn.position)).scalar() or 0) + 1
    column = KanbanColumn(**data)
    if column.is_default:
        db.query(KanbanColumn).update({KanbanColumn.is_default: False})
        column.is_default = True
    db.add(column)
    db.commit()
    db.refresh(column)
    return KanbanColumnOut(**{c: getattr(column, c) for c in KanbanColumnOut.model_fields if c != "audits_count"}, audits_count=0)


@kanban_router.patch("/columns/{column_id}", response_model=KanbanColumnOut)
def update_kanban_column(
    column_id: str, payload: KanbanColumnUpdate, db: Session = Depends(get_db), _: User = Depends(require_admin)
):
    column = db.get(KanbanColumn, column_id)
    if column is None:
        raise HTTPException(status_code=404, detail="Colonne introuvable")

    data = payload.model_dump(exclude_unset=True)
    if "key" in data and data["key"] != column.key:
        if db.query(KanbanColumn).filter(KanbanColumn.key == data["key"]).first():
            raise HTTPException(status_code=400, detail="Une colonne avec cette clé existe déjà")
    if data.get("is_default"):
        db.query(KanbanColumn).update({KanbanColumn.is_default: False})
    for field, value in data.items():
        setattr(column, field, value)
    db.commit()

    counts = db.query(func.count(Audit.id)).filter(Audit.kanban_column_id == column.id).scalar() or 0
    return KanbanColumnOut(
        **{c: getattr(column, c) for c in KanbanColumnOut.model_fields if c != "audits_count"},
        audits_count=counts,
    )


@kanban_router.post("/columns/reorder", response_model=list[KanbanColumnOut])
def reorder_kanban_columns(
    payload: KanbanReorder, db: Session = Depends(get_db), _: User = Depends(require_admin)
):
    columns = {c.id: c for c in db.query(KanbanColumn).all()}
    unknown = [cid for cid in payload.column_ids if cid not in columns]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Colonne(s) inconnue(s) : {', '.join(unknown)}")
    for position, column_id in enumerate(payload.column_ids):
        columns[column_id].position = position
    db.commit()
    return _columns_with_counts(db, include_inactive=True)


@kanban_router.delete("/columns/{column_id}", status_code=204)
def delete_kanban_column(
    column_id: str,
    move_audits_to: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Supprime une colonne. Les audits qu'elle contient sont déplacés vers
    `move_audits_to` (ou vers la colonne par défaut) : aucun audit n'est perdu."""
    column = db.get(KanbanColumn, column_id)
    if column is None:
        raise HTTPException(status_code=404, detail="Colonne introuvable")
    if db.query(KanbanColumn).count() <= 1:
        raise HTTPException(status_code=400, detail="Le tableau doit conserver au moins une colonne")

    target_id = move_audits_to
    if target_id == column_id:
        raise HTTPException(status_code=400, detail="La colonne de destination doit être différente")
    if target_id is None:
        fallback = (
            db.query(KanbanColumn)
            .filter(KanbanColumn.id != column_id, KanbanColumn.is_active.is_(True))
            .order_by(KanbanColumn.is_default.desc(), KanbanColumn.position)
            .first()
        )
        target_id = fallback.id if fallback else None
    elif db.get(KanbanColumn, target_id) is None:
        raise HTTPException(status_code=404, detail="Colonne de destination introuvable")

    target = db.get(KanbanColumn, target_id) if target_id else None
    # Réaffectation en masse AVANT la suppression : la relation ORM remettrait
    # sinon `kanban_column_id` à NULL au moment du flush.
    values: dict = {Audit.kanban_column_id: target_id}
    if target is not None and target.mapped_status is not None:
        values[Audit.status] = target.mapped_status
    db.query(Audit).filter(Audit.kanban_column_id == column_id).update(values, synchronize_session=False)
    db.expire_all()
    db.delete(db.get(KanbanColumn, column_id))
    db.commit()


# ---------------------------------------------------------------------------
# Paramètres applicatifs
# ---------------------------------------------------------------------------
@settings_router.get("", response_model=list[AppSettingOut])
def list_settings(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return db.query(AppSetting).order_by(AppSetting.key).all()


@settings_router.get("/{key}", response_model=AppSettingOut)
def get_setting(key: str, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    setting = db.get(AppSetting, key)
    if setting is None:
        raise HTTPException(status_code=404, detail="Paramètre introuvable")
    return setting


@settings_router.put("/{key}", response_model=AppSettingOut)
def update_setting(
    key: str, payload: AppSettingUpdate, db: Session = Depends(get_db), _: User = Depends(require_admin)
):
    setting = db.get(AppSetting, key)
    if setting is None:
        setting = AppSetting(key=key, value=payload.value)
        db.add(setting)
    else:
        setting.value = {**(setting.value or {}), **payload.value}
    db.commit()
    db.refresh(setting)
    return setting


# ---------------------------------------------------------------------------
# Champs personnalisés
# ---------------------------------------------------------------------------
@custom_fields_router.get("", response_model=list[CustomFieldOut])
def list_custom_fields(
    entity: str = "audit",
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = db.query(CustomFieldDefinition).filter(CustomFieldDefinition.entity == entity)
    if not include_inactive:
        query = query.filter(CustomFieldDefinition.is_active.is_(True))
    return query.order_by(CustomFieldDefinition.position, CustomFieldDefinition.label).all()


@custom_fields_router.post("", response_model=CustomFieldOut, status_code=201)
def create_custom_field(
    payload: CustomFieldCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)
):
    exists = (
        db.query(CustomFieldDefinition)
        .filter(CustomFieldDefinition.entity == payload.entity, CustomFieldDefinition.key == payload.key)
        .first()
    )
    if exists:
        raise HTTPException(status_code=400, detail="Un champ avec cette clé existe déjà")
    field = CustomFieldDefinition(**payload.model_dump())
    db.add(field)
    db.commit()
    db.refresh(field)
    return field


@custom_fields_router.patch("/{field_id}", response_model=CustomFieldOut)
def update_custom_field(
    field_id: str, payload: CustomFieldUpdate, db: Session = Depends(get_db), _: User = Depends(require_admin)
):
    field = db.get(CustomFieldDefinition, field_id)
    if field is None:
        raise HTTPException(status_code=404, detail="Champ introuvable")
    for name, value in payload.model_dump(exclude_unset=True).items():
        setattr(field, name, value)
    db.commit()
    db.refresh(field)
    return field


@custom_fields_router.delete("/{field_id}", status_code=204)
def delete_custom_field(
    field_id: str,
    purge_values: bool = False,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Par défaut le champ est désactivé (les valeurs saisies sont conservées).
    `purge_values=true` supprime définitivement le champ et ses valeurs."""
    field = db.get(CustomFieldDefinition, field_id)
    if field is None:
        raise HTTPException(status_code=404, detail="Champ introuvable")
    if purge_values:
        db.query(AuditCustomValue).filter(AuditCustomValue.field_id == field_id).delete()
        db.delete(field)
    else:
        field.is_active = False
    db.commit()


# ---------------------------------------------------------------------------
# Étiquettes
# ---------------------------------------------------------------------------
@tags_router.get("", response_model=list[TagOut])
def list_tags(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return db.query(Tag).order_by(Tag.name).all()


@tags_router.post("", response_model=TagOut, status_code=201)
def create_tag(payload: TagCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    if db.query(Tag).filter(func.lower(Tag.name) == payload.name.strip().lower()).first():
        raise HTTPException(status_code=400, detail="Cette étiquette existe déjà")
    tag = Tag(**payload.model_dump())
    tag.name = tag.name.strip()
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag


@tags_router.patch("/{tag_id}", response_model=TagOut)
def update_tag(tag_id: str, payload: TagUpdate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    tag = db.get(Tag, tag_id)
    if tag is None:
        raise HTTPException(status_code=404, detail="Étiquette introuvable")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(tag, field, value)
    db.commit()
    db.refresh(tag)
    return tag


@tags_router.delete("/{tag_id}", status_code=204)
def delete_tag(tag_id: str, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    tag = db.get(Tag, tag_id)
    if tag is None:
        raise HTTPException(status_code=404, detail="Étiquette introuvable")
    db.delete(tag)
    db.commit()
