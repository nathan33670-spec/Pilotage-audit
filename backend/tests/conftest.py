import os
import tempfile

import pytest

TMP_DIR = tempfile.mkdtemp(prefix="pilotage-audit-tests-")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{TMP_DIR}/test.db")
os.environ.setdefault("SECRET_KEY", "test-secret")
os.environ.setdefault("UPLOADS_DIR", f"{TMP_DIR}/uploads")
os.environ.setdefault("ADMIN_EMAIL", "admin@pilotage-audit.local")
os.environ.setdefault("ADMIN_PASSWORD", "Test1234!")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="session")
def admin_headers(client):
    response = client.post(
        "/api/auth/login",
        data={"username": os.environ["ADMIN_EMAIL"], "password": os.environ["ADMIN_PASSWORD"]},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}
