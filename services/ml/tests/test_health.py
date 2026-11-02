from fastapi.testclient import TestClient

from app.main import create_app


def test_health_tra_ve_ok() -> None:
    client = TestClient(create_app())
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "ml"}


def test_duong_dan_khac_tra_404() -> None:
    client = TestClient(create_app())
    assert client.get("/khong-co").status_code == 404
