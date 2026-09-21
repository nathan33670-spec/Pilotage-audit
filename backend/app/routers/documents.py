import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.deps import get_current_user, require_pilote_or_admin
from app.models import Audit, Document, DocumentType, User
from app.schemas import DocumentOut

router = APIRouter(prefix="/api/audits/{audit_id}/documents", tags=["documents"])
settings = get_settings()


def _audit_upload_dir(audit_id: str) -> Path:
    directory = Path(settings.uploads_dir) / audit_id
    directory.mkdir(parents=True, exist_ok=True)
    return directory


@router.get("", response_model=list[DocumentOut])
def list_documents(audit_id: str, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    if db.get(Audit, audit_id) is None:
        raise HTTPException(status_code=404, detail="Audit introuvable")
    return db.query(Document).filter(Document.audit_id == audit_id).order_by(Document.uploaded_at.desc()).all()


@router.post("", response_model=DocumentOut, status_code=201)
async def upload_document(
    audit_id: str,
    file: UploadFile,
    doc_type: DocumentType = DocumentType.AUTRE,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_pilote_or_admin),
):
    audit = db.get(Audit, audit_id)
    if audit is None:
        raise HTTPException(status_code=404, detail="Audit introuvable")

    max_size = settings.max_upload_size_mb * 1024 * 1024
    content = await file.read()
    if len(content) > max_size:
        raise HTTPException(status_code=413, detail=f"Fichier trop volumineux (max {settings.max_upload_size_mb} Mo)")

    original_name = Path(file.filename or "document").name  # strip any path components (traversal safety)
    stored_name = f"{uuid.uuid4()}_{original_name}"
    destination = _audit_upload_dir(audit_id) / stored_name
    destination.write_bytes(content)

    document = Document(
        audit_id=audit_id,
        filename=original_name,
        stored_filename=stored_name,
        content_type=file.content_type,
        size_bytes=len(content),
        doc_type=doc_type,
        uploaded_by_id=current_user.id,
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


@router.get("/{document_id}/download")
def download_document(audit_id: str, document_id: str, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    document = db.get(Document, document_id)
    if document is None or document.audit_id != audit_id:
        raise HTTPException(status_code=404, detail="Document introuvable")

    file_path = _audit_upload_dir(audit_id) / document.stored_filename
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Fichier introuvable sur le serveur")

    return FileResponse(path=file_path, filename=document.filename, media_type=document.content_type)


@router.delete("/{document_id}", status_code=204)
def delete_document(
    audit_id: str, document_id: str, db: Session = Depends(get_db), _: User = Depends(require_pilote_or_admin)
):
    document = db.get(Document, document_id)
    if document is None or document.audit_id != audit_id:
        raise HTTPException(status_code=404, detail="Document introuvable")

    file_path = _audit_upload_dir(audit_id) / document.stored_filename
    file_path.unlink(missing_ok=True)

    db.delete(document)
    db.commit()
