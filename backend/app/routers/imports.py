"""Import en masse des TI (tests d'intrusion / audits).

Parcours en trois temps :
  1. `POST /api/imports`           — dépôt du fichier et analyse
  2. `PATCH /api/imports/{id}`     — saisie des détails manquants (page dédiée)
  3. `POST /api/imports/{id}/commit` — création effective des audits

Les valeurs référencées absentes de la base (catégorie, société de prestation,
pilote, étiquette) et les colonnes inconnues (futurs champs personnalisés) sont
remontées par l'analyse ; l'analyste complète les informations manquantes avant
de valider.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.deps import get_current_user, require_pilote_or_admin
from app.importer import (
    ENTITY_TARGETS,
    MAX_ROWS,
    TARGET_FIELDS,
    best_match,
    coerce_value,
    detect_type,
    normalize,
    parse_date,
    parse_number,
    read_table,
    slugify_key,
    split_multi,
    suggest_mapping,
)
from app.models import (
    Audit,
    AuditCustomValue,
    AuditPriority,
    AuditStatus,
    AuthProvider,
    Category,
    CustomFieldDefinition,
    CustomFieldType,
    ImportBatch,
    ImportStatus,
    KanbanColumn,
    PhaseTemplate,
    PrerequisiteTemplate,
    PrestationCompany,
    Tag,
    User,
    UserRole,
)
from app.routers.audits import _apply_phase_template
from app.schemas import (
    ImportAnalysisOut,
    ImportBatchOut,
    ImportColumnAnalysis,
    ImportCommitReport,
    ImportMissingEntity,
    ImportResolutionsIn,
    ImportRowPreview,
)

router = APIRouter(prefix="/api/imports", tags=["imports"])
settings = get_settings()

PREVIEW_ROWS = 50
IGNORE = "__ignore__"
CUSTOM_PREFIX = "custom:"

# Champ du modèle Audit alimenté par chaque colonne cible référençant une entité
FIELD_BY_TARGET = {
    "category": "category_id",
    "prestation_company": "prestation_company_id",
    "pilot": "pilot_id",
    "service_owner": "service_owner_id",
}

EXAMPLE_TEMPLATE = (
    "Reference;Nom;Categorie;Priorite;Statut;Pilote;Societe de prestation;"
    "Debut prevu;Fin prevue;Debut reel;Fin reel;Charge estimee;Etiquettes;Description\n"
    "TI-2026-001;Test d'intrusion portail client;Applicatif externe;haute;planifie;"
    "Alice Martin;SecuAudit;2026-03-02;2026-03-13;;;10;externe;internet;Portail client production\n"
)


# ---------------------------------------------------------------------------
# Analyse
# ---------------------------------------------------------------------------
def _entity_key(entity: str, value: str) -> str:
    return f"{entity}::{value}"


def _existing_entities(db: Session) -> dict[str, dict[str, str]]:
    return {
        "category": {c.id: c.name for c in db.query(Category).all()},
        "prestation_company": {c.id: c.name for c in db.query(PrestationCompany).all()},
        "user": {u.id: u.full_name for u in db.query(User).all()},
        "tag": {t.id: t.name for t in db.query(Tag).all()},
    }


def _custom_fields(db: Session) -> dict[str, CustomFieldDefinition]:
    return {
        f.key: f
        for f in db.query(CustomFieldDefinition).filter(CustomFieldDefinition.entity == "audit").all()
    }


def _effective_mapping(batch: ImportBatch) -> dict[str, str]:
    mapping = dict(batch.mapping or {})
    return {header: target for header, target in mapping.items() if target and target != IGNORE}


def build_analysis(db: Session, batch: ImportBatch) -> ImportAnalysisOut:
    headers: list[str] = list(batch.source_columns or [])
    rows: list[dict] = list(batch.rows or [])
    mapping = _effective_mapping(batch)
    resolutions = dict(batch.resolutions or {})
    entity_decisions: dict[str, dict] = resolutions.get("entities", {}) or {}
    new_field_decisions: dict[str, dict] = resolutions.get("new_fields", {}) or {}
    options = dict(batch.options or {})

    existing = _existing_entities(db)
    custom_fields = _custom_fields(db)

    # --- colonnes -----------------------------------------------------------
    columns: list[ImportColumnAnalysis] = []
    new_fields: list[ImportColumnAnalysis] = []
    for header in headers:
        values = [row.get(header) for row in rows]
        filled = [v for v in values if v not in (None, "")]
        target = mapping.get(header)
        decision = new_field_decisions.get(header) or {}
        is_known = bool(target) and (
            target in TARGET_FIELDS or (target.startswith(CUSTOM_PREFIX) and target[len(CUSTOM_PREFIX):] in custom_fields)
        )
        analysis = ImportColumnAnalysis(
            source=header,
            suggested_target=target,
            sample_values=[str(v) for v in filled[:5]],
            filled_ratio=round(len(filled) / len(rows), 4) if rows else 0.0,
            detected_type=CustomFieldType(decision["field_type"]) if decision.get("field_type") else detect_type(values),
            is_known_field=is_known,
        )
        columns.append(analysis)
        if not is_known and (batch.mapping or {}).get(header) != IGNORE:
            new_fields.append(analysis)

    # --- entités référencées manquantes ------------------------------------
    missing: dict[str, ImportMissingEntity] = {}
    for header, target in mapping.items():
        entity = ENTITY_TARGETS.get(target)
        if entity is None:
            continue
        for row in rows:
            raw = row.get(header)
            values = split_multi(raw) if target == "tags" else ([str(raw).strip()] if raw not in (None, "") else [])
            for value in values:
                candidates = existing[entity]
                matched_id, _label = best_match(value, candidates, threshold=1.01)  # correspondance exacte
                if matched_id:
                    continue
                key = _entity_key(entity, value)
                if key in missing:
                    missing[key].occurrences += 1
                    continue
                suggestion_id, suggestion_label = best_match(value, candidates)
                decided = entity_decisions.get(key) or {}
                missing[key] = ImportMissingEntity(
                    entity=entity,
                    value=value,
                    occurrences=1,
                    suggested_match=decided.get("id") or suggestion_id,
                    suggested_match_label=suggestion_label,
                )

    # --- lignes / erreurs / doublons ---------------------------------------
    previews, errors_count, duplicates_count = _validate_rows(db, batch, mapping, rows, options)

    return ImportAnalysisOut(
        id=batch.id,
        filename=batch.filename,
        status=batch.status,
        created_at=batch.created_at,
        rows_count=len(rows),
        columns=columns,
        mapping=dict(batch.mapping or {}),
        missing_entities=sorted(missing.values(), key=lambda m: (m.entity, m.value)),
        new_fields=new_fields,
        rows_preview=previews[:PREVIEW_ROWS],
        errors_count=errors_count,
        duplicates_count=duplicates_count,
        available_targets={key: label for key, (label, _kind) in TARGET_FIELDS.items()},
        options=options,
        report=batch.report,
    )


def _validate_rows(
    db: Session, batch: ImportBatch, mapping: dict[str, str], rows: list[dict], options: dict
) -> tuple[list[ImportRowPreview], int, int]:
    name_header = next((h for h, t in mapping.items() if t == "name"), None)
    reference_header = next((h for h, t in mapping.items() if t == "reference"), None)

    existing_refs = {
        normalize(a.reference): a.id for a in db.query(Audit).filter(Audit.reference.isnot(None)).all()
    }
    existing_names = {normalize(a.name): a.id for a in db.query(Audit).all()}

    previews: list[ImportRowPreview] = []
    seen_keys: dict[str, int] = {}
    errors_count = 0
    duplicates_count = 0

    for index, row in enumerate(rows):
        errors: list[str] = []
        warnings: list[str] = []
        name = (row.get(name_header) or "").strip() if name_header else ""
        reference = (row.get(reference_header) or "").strip() if reference_header else ""

        if not name:
            errors.append("Nom de l'audit manquant (colonne « Nom » non renseignée ou non mappée)")

        for header, target in mapping.items():
            raw = row.get(header)
            if raw in (None, ""):
                continue
            kind = TARGET_FIELDS.get(target, ("", "scalar"))[1]
            if kind == "date" and parse_date(raw) is None:
                warnings.append(f"« {header} » : date illisible ({raw}) — champ laissé vide")
            elif kind == "number" and parse_number(raw) is None:
                warnings.append(f"« {header} » : nombre illisible ({raw}) — champ laissé vide")
            elif kind == "enum_priority" and coerce_value(target, raw) is None:
                warnings.append(f"« {header} » : priorité inconnue ({raw}) — valeur par défaut appliquée")
            elif kind == "enum_status" and coerce_value(target, raw) is None:
                warnings.append(f"« {header} » : statut inconnu ({raw}) — valeur par défaut appliquée")

        duplicate_of = None
        dedupe_key = normalize(reference) if reference else normalize(name)
        if dedupe_key:
            if dedupe_key in seen_keys:
                duplicate_of = f"ligne {seen_keys[dedupe_key] + 1} du fichier"
            elif reference and dedupe_key in existing_refs:
                duplicate_of = existing_refs[dedupe_key]
            elif not reference and dedupe_key in existing_names:
                duplicate_of = existing_names[dedupe_key]
            seen_keys.setdefault(dedupe_key, index)

        if duplicate_of:
            duplicates_count += 1
        if errors:
            errors_count += 1

        previews.append(
            ImportRowPreview(
                index=index,
                values={h: (row.get(h) if row.get(h) is not None else None) for h in (batch.source_columns or [])},
                errors=errors,
                warnings=warnings,
                duplicate_of=duplicate_of,
            )
        )
    return previews, errors_count, duplicates_count


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@router.get("/template.csv", response_class=PlainTextResponse)
def download_template(_: User = Depends(get_current_user)):
    """Modèle de fichier d'import (CSV point-virgule, encodage UTF-8)."""
    return PlainTextResponse(
        EXAMPLE_TEMPLATE,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="modele-import-ti.csv"'},
    )


@router.get("", response_model=list[ImportBatchOut])
def list_batches(db: Session = Depends(get_db), _: User = Depends(require_pilote_or_admin)):
    return db.query(ImportBatch).order_by(ImportBatch.created_at.desc()).limit(50).all()


@router.post("", response_model=ImportAnalysisOut, status_code=201)
async def create_batch(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_pilote_or_admin),
):
    content = await file.read()
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(status_code=413, detail=f"Fichier trop volumineux (maximum {settings.max_upload_size_mb} Mo)")
    if not content:
        raise HTTPException(status_code=400, detail="Fichier vide")

    try:
        headers, rows = read_table(file.filename or "import.csv", content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if len(rows) >= MAX_ROWS:
        raise HTTPException(
            status_code=400,
            detail=f"Fichier trop volumineux : {MAX_ROWS} lignes maximum par lot. Découpez le fichier.",
        )

    batch = ImportBatch(
        filename=file.filename or "import.csv",
        created_by_id=current_user.id,
        source_columns=headers,
        rows=rows,
        mapping=suggest_mapping(headers),
        resolutions={},
        options={"duplicate_strategy": "ignorer", "default_priority": "moyenne", "default_status": "planifie"},
        status=ImportStatus.ANALYSE,
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)
    return build_analysis(db, batch)


@router.get("/{batch_id}", response_model=ImportAnalysisOut)
def get_batch(batch_id: str, db: Session = Depends(get_db), _: User = Depends(require_pilote_or_admin)):
    batch = db.get(ImportBatch, batch_id)
    if batch is None:
        raise HTTPException(status_code=404, detail="Lot d'import introuvable")
    return build_analysis(db, batch)


@router.patch("/{batch_id}", response_model=ImportAnalysisOut)
def update_batch(
    batch_id: str,
    payload: ImportResolutionsIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_pilote_or_admin),
):
    batch = db.get(ImportBatch, batch_id)
    if batch is None:
        raise HTTPException(status_code=404, detail="Lot d'import introuvable")
    if batch.status == ImportStatus.IMPORTE:
        raise HTTPException(status_code=400, detail="Ce lot a déjà été importé")

    if payload.mapping is not None:
        batch.mapping = payload.mapping
    resolutions = dict(batch.resolutions or {})
    if payload.entities is not None:
        resolutions["entities"] = {**(resolutions.get("entities") or {}), **payload.entities}
    if payload.new_fields is not None:
        resolutions["new_fields"] = {**(resolutions.get("new_fields") or {}), **payload.new_fields}
    batch.resolutions = resolutions
    if payload.options is not None:
        batch.options = {**(batch.options or {}), **payload.options}
    batch.status = ImportStatus.A_COMPLETER
    db.commit()
    db.refresh(batch)
    return build_analysis(db, batch)


@router.delete("/{batch_id}", status_code=204)
def delete_batch(batch_id: str, db: Session = Depends(get_db), _: User = Depends(require_pilote_or_admin)):
    batch = db.get(ImportBatch, batch_id)
    if batch is None:
        raise HTTPException(status_code=404, detail="Lot d'import introuvable")
    db.delete(batch)
    db.commit()


# ---------------------------------------------------------------------------
# Validation de l'import
# ---------------------------------------------------------------------------
def _resolve_entities(db: Session, batch: ImportBatch, analysis: ImportAnalysisOut) -> tuple[dict, dict[str, int]]:
    """Crée (ou rattache) les entités manquantes selon les décisions saisies.
    Retourne l'index {entity::valeur -> id} et le compte des créations."""
    decisions: dict[str, dict] = (batch.resolutions or {}).get("entities", {}) or {}
    created: dict[str, int] = {}
    index: dict[str, str | None] = {}

    for missing in analysis.missing_entities:
        key = _entity_key(missing.entity, missing.value)
        decision = decisions.get(key) or {}
        action = decision.get("action") or ("map" if decision.get("id") else "create")
        if action == "ignore":
            index[key] = None
            continue
        if action == "map" and decision.get("id"):
            index[key] = decision["id"]
            continue

        details = decision.get("details") or {}
        if missing.entity == "category":
            record = Category(
                name=details.get("name") or missing.value,
                description=details.get("description"),
                code=details.get("code"),
                color=details.get("color"),
                default_duration_days=details.get("default_duration_days"),
            )
        elif missing.entity == "prestation_company":
            record = PrestationCompany(
                name=details.get("name") or missing.value,
                contact_name=details.get("contact_name"),
                contact_email=details.get("contact_email"),
                contact_phone=details.get("contact_phone"),
                allocated_days=details.get("allocated_days"),
                notes=details.get("notes"),
            )
        elif missing.entity == "tag":
            record = Tag(name=details.get("name") or missing.value, color=details.get("color"))
        elif missing.entity == "user":
            email = (details.get("email") or "").strip()
            if not email:
                slug = slugify_key(missing.value).replace("_", ".")
                email = f"{slug}@{(batch.options or {}).get('user_email_domain', 'import.local')}"
            if db.query(User).filter(User.email == email).first():
                index[key] = db.query(User).filter(User.email == email).first().id
                continue
            record = User(
                email=email,
                full_name=details.get("full_name") or missing.value,
                role=UserRole(details.get("role") or UserRole.PILOTE_AUDIT.value),
                auth_provider=AuthProvider.LOCAL,
                hashed_password=None,  # compte sans mot de passe : à initialiser par un administrateur
                is_active=bool(details.get("is_active", True)),
            )
        else:  # pragma: no cover - garde-fou
            continue

        db.add(record)
        db.flush()
        index[key] = record.id
        created[missing.entity] = created.get(missing.entity, 0) + 1

    return index, created


def _resolve_new_fields(db: Session, batch: ImportBatch, analysis: ImportAnalysisOut) -> tuple[dict[str, str], int]:
    """Crée les champs personnalisés retenus. Retourne {colonne source -> field_id}."""
    decisions: dict[str, dict] = (batch.resolutions or {}).get("new_fields", {}) or {}
    existing = _custom_fields(db)
    created = 0
    header_to_field: dict[str, str] = {}

    # colonnes explicitement mappées vers un champ personnalisé existant
    for header, target in _effective_mapping(batch).items():
        if target.startswith(CUSTOM_PREFIX):
            field = existing.get(target[len(CUSTOM_PREFIX):])
            if field is not None:
                header_to_field[header] = field.id

    position = (max((f.position for f in existing.values()), default=0)) + 1
    for column in analysis.new_fields:
        decision = decisions.get(column.source) or {}
        if decision.get("create") is False:
            continue
        key = slugify_key(decision.get("key") or column.source)
        if key in existing:
            header_to_field[column.source] = existing[key].id
            continue
        field = CustomFieldDefinition(
            entity="audit",
            key=key,
            label=decision.get("label") or column.source,
            field_type=CustomFieldType(decision.get("field_type") or column.detected_type.value),
            description=decision.get("description"),
            options=decision.get("options"),
            is_required=bool(decision.get("is_required", False)),
            show_in_list=bool(decision.get("show_in_list", False)),
            position=position,
            created_from_import=True,
        )
        position += 1
        db.add(field)
        db.flush()
        existing[key] = field
        header_to_field[column.source] = field.id
        created += 1

    return header_to_field, created


@router.post("/{batch_id}/commit", response_model=ImportCommitReport)
def commit_batch(
    batch_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_pilote_or_admin),
):
    batch = db.get(ImportBatch, batch_id)
    if batch is None:
        raise HTTPException(status_code=404, detail="Lot d'import introuvable")
    if batch.status == ImportStatus.IMPORTE:
        raise HTTPException(status_code=400, detail="Ce lot a déjà été importé")

    analysis = build_analysis(db, batch)
    mapping = _effective_mapping(batch)
    if "name" not in mapping.values():
        raise HTTPException(status_code=400, detail="La colonne « Nom de l'audit » doit être mappée avant l'import")

    options = dict(batch.options or {})
    duplicate_strategy = options.get("duplicate_strategy", "ignorer")  # ignorer | creer | mettre_a_jour
    default_priority = AuditPriority(options.get("default_priority") or AuditPriority.MOYENNE.value)
    default_status = AuditStatus(options.get("default_status") or AuditStatus.PLANIFIE.value)

    entity_index, created_entities = _resolve_entities(db, batch, analysis)
    header_to_field, created_fields = _resolve_new_fields(db, batch, analysis)

    existing_entities = _existing_entities(db)

    def _entity_id(entity: str, value: str) -> str | None:
        exact, _label = best_match(value, existing_entities[entity], threshold=1.01)
        if exact:
            return exact
        return entity_index.get(_entity_key(entity, value))

    columns = {c.mapped_status: c for c in db.query(KanbanColumn).all() if c.mapped_status is not None}
    default_column = (
        db.query(KanbanColumn).filter(KanbanColumn.is_default.is_(True)).first()
        or db.query(KanbanColumn).order_by(KanbanColumn.position).first()
    )

    report = ImportCommitReport(
        batch_id=batch.id,
        created_audits=0,
        updated_audits=0,
        skipped_rows=0,
        created_entities=created_entities,
        created_fields=created_fields,
        errors=[],
    )

    preview_by_index = {p.index: p for p in analysis.rows_preview}
    for index, row in enumerate(batch.rows or []):
        preview = preview_by_index.get(index)
        row_errors = preview.errors if preview else []
        duplicate_of = preview.duplicate_of if preview else None
        if row_errors:
            report.skipped_rows += 1
            if len(report.errors) < 50:
                report.errors.append(f"Ligne {index + 1} ignorée : {row_errors[0]}")
            continue

        target_audit: Audit | None = None
        if duplicate_of:
            if duplicate_strategy == "ignorer":
                report.skipped_rows += 1
                continue
            if duplicate_strategy == "mettre_a_jour" and not duplicate_of.startswith("ligne "):
                target_audit = db.get(Audit, duplicate_of)

        values: dict = {}
        tags: list[str] = []
        custom_values: dict[str, str] = {}
        for header, target in mapping.items():
            raw = row.get(header)
            if target.startswith(CUSTOM_PREFIX):
                field_id = header_to_field.get(header)
                if field_id and raw not in (None, ""):
                    custom_values[field_id] = str(raw)
                continue
            if raw in (None, ""):
                continue
            entity = ENTITY_TARGETS.get(target)
            if entity == "tag":
                for tag_value in split_multi(raw):
                    tag_id = _entity_id("tag", tag_value)
                    if tag_id:
                        tags.append(tag_id)
                continue
            if entity:
                resolved = _entity_id(entity, str(raw).strip())
                if resolved is None:
                    continue
                values[FIELD_BY_TARGET[target]] = resolved
                continue
            converted = coerce_value(target, raw)
            if converted is not None:
                values[target] = converted

        # colonnes non mappées devenues champs personnalisés
        for header, field_id in header_to_field.items():
            if header in mapping:
                continue
            raw = row.get(header)
            if raw not in (None, ""):
                custom_values[field_id] = str(raw)

        values.setdefault("priority", default_priority)
        values.setdefault("status", default_status)

        if target_audit is not None:
            for field, value in values.items():
                setattr(target_audit, field, value)
            audit = target_audit
            report.updated_audits += 1
        else:
            audit = Audit(**values, import_batch_id=batch.id)
            db.add(audit)
            report.created_audits += 1

        column = columns.get(audit.status, default_column)
        audit.kanban_column_id = column.id if column else None

        db.flush()

        if tags:
            tag_records = db.query(Tag).filter(Tag.id.in_(set(tags))).all()
            existing_ids = {t.id for t in audit.tags}
            for tag in tag_records:
                if tag.id not in existing_ids:
                    audit.tags.append(tag)

        for field_id, value in custom_values.items():
            current = next((v for v in audit.custom_values if v.field_id == field_id), None)
            if current is None:
                db.add(AuditCustomValue(audit_id=audit.id, field_id=field_id, value=value))
            else:
                current.value = value

        # Application facultative des templates (pré-requis / phases)
        if target_audit is None:
            _apply_optional_templates(db, audit, options)

    batch.status = ImportStatus.IMPORTE
    batch.committed_at = datetime.now(timezone.utc)
    batch.report = report.model_dump()
    db.commit()
    return report


def _apply_optional_templates(db: Session, audit: Audit, options: dict) -> None:
    template_id = options.get("apply_template_id")
    phase_template_id = options.get("apply_phase_template_id")
    auto_by_category = bool(options.get("auto_template_by_category"))

    template = db.get(PrerequisiteTemplate, template_id) if template_id else None
    phase_template = db.get(PhaseTemplate, phase_template_id) if phase_template_id else None

    if auto_by_category and audit.category_id:
        template = template or (
            db.query(PrerequisiteTemplate).filter(PrerequisiteTemplate.category_id == audit.category_id).first()
        )
        phase_template = phase_template or (
            db.query(PhaseTemplate).filter(PhaseTemplate.category_id == audit.category_id).first()
        )

    if template is not None:
        from app.models import AuditPrerequisite

        for item in template.items:
            audit.prerequisites.append(
                AuditPrerequisite(template_item_id=item.id, label=item.label, is_mandatory=item.is_mandatory)
            )
    if phase_template is not None:
        _apply_phase_template(audit, phase_template)
