from fastapi.testclient import TestClient

from app.embedding import DIMENSIONS, MAX_CHARS, MAX_TEXTS, EmbeddingUnavailableError
from app.main import create_app


class FakeEmbedder:
    def __init__(self, dimensions: int = DIMENSIONS, count_delta: int = 0) -> None:
        self.dimensions = dimensions
        self.count_delta = count_delta
        self.calls: list[list[str]] = []

    def embed(self, texts: list[str]) -> list[list[float]]:
        self.calls.append(texts)
        return [[0.5] * self.dimensions for _ in range(len(texts) + self.count_delta)]


class BrokenEmbedder:
    def embed(self, texts: list[str]) -> list[list[float]]:
        raise EmbeddingUnavailableError("thiếu thư viện")


def client(embedder=None, token=None) -> TestClient:
    return TestClient(create_app(embedder=embedder, api_token=token))


def test_embed_tra_vector_1024_chieu_va_ten_mo_hinh() -> None:
    fake = FakeEmbedder()
    response = client(fake).post("/embed", json={"texts": ["ship bao lâu", "đổi trả"]})
    assert response.status_code == 200
    body = response.json()
    assert body["model"] == "bge-m3"
    assert body["dimensions"] == DIMENSIONS == 1024
    assert len(body["vectors"]) == 2 and len(body["vectors"][0]) == 1024
    assert fake.calls == [["ship bao lâu", "đổi trả"]]


def test_embed_tat_mac_dinh_tra_503_khong_nap_model(monkeypatch) -> None:
    monkeypatch.delenv("ML_EMBED_ENABLED", raising=False)
    response = TestClient(create_app()).post("/embed", json={"texts": ["a"]})
    assert response.status_code == 503
    assert response.json()["detail"] == "embedding_disabled"


def test_embed_bat_bang_bien_moi_truong_dung_chu_true(monkeypatch) -> None:
    from app import main

    created: list[str] = []

    class Spy:
        def __init__(self) -> None:
            created.append("x")

        def embed(self, texts: list[str]) -> list[list[float]]:
            return [[0.0] * DIMENSIONS for _ in texts]

    monkeypatch.setattr(main, "SentenceTransformerEmbedder", Spy)
    monkeypatch.setenv("ML_EMBED_ENABLED", "1")
    assert main._default_embedder() is None
    monkeypatch.setenv("ML_EMBED_ENABLED", "true")
    assert main._default_embedder() is not None
    assert created == ["x"]


def test_embed_thieu_thu_vien_tra_503_khong_sap() -> None:
    response = client(BrokenEmbedder()).post("/embed", json={"texts": ["a"]})
    assert response.status_code == 503
    assert response.json()["detail"] == "embedding_unavailable"


def test_embed_kiem_tra_dau_vao() -> None:
    c = client(FakeEmbedder())
    assert c.post("/embed", json={"texts": []}).status_code == 422
    assert c.post("/embed", json={"texts": [""]}).status_code == 422
    assert c.post("/embed", json={"texts": ["a"] * (MAX_TEXTS + 1)}).status_code == 422
    assert c.post("/embed", json={"texts": ["a" * (MAX_CHARS + 1)]}).status_code == 422
    assert c.post("/embed", json={"texts": ["a" * MAX_CHARS]}).status_code == 200
    assert c.post("/embed", json={"texts": ["a"] * MAX_TEXTS}).status_code == 200


def test_embed_khong_tra_vector_sai_chieu_hoac_sai_so_luong() -> None:
    wrong_dim = client(FakeEmbedder(dimensions=8)).post("/embed", json={"texts": ["a"]})
    assert wrong_dim.status_code == 502
    wrong_count = client(FakeEmbedder(count_delta=1)).post("/embed", json={"texts": ["a"]})
    assert wrong_count.status_code == 502
    assert wrong_count.json()["detail"] == "embedding_bad_shape"


def test_embed_co_token_thi_bat_buoc_bearer_dung() -> None:
    c = client(FakeEmbedder(), token="bi-mat-test")
    body = {"texts": ["a"]}
    assert c.post("/embed", json=body).status_code == 401
    assert c.post("/embed", json=body, headers={"Authorization": "Bearer sai"}).status_code == 401
    assert (
        c.post("/embed", json=body, headers={"Authorization": "Bearer bi-mat-test"}).status_code
        == 200
    )
    # /health luôn mở cho healthcheck của compose
    assert c.get("/health").status_code == 200
