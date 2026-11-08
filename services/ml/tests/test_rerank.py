from fastapi.testclient import TestClient

from app.main import create_app
from app.rerank import MAX_CHARS, MAX_DOCUMENTS, RerankUnavailableError


class FakeReranker:
    """Bản giả CHỈ cho test tự động (cắm qua tham số, không chọn được bằng env)."""

    def __init__(self, count_delta: int = 0) -> None:
        self.count_delta = count_delta
        self.calls: list[tuple[str, list[str]]] = []

    def rerank(self, query: str, documents: list[str]) -> list[float]:
        self.calls.append((query, documents))
        # Điểm giảm dần theo thứ tự để kiểm tra giữ nguyên thứ tự đầu vào.
        return [1.0 / (i + 1) for i in range(len(documents) + self.count_delta)]


class BrokenReranker:
    def rerank(self, query: str, documents: list[str]) -> list[float]:
        raise RerankUnavailableError("thiếu thư viện")


def client(reranker=None, token=None) -> TestClient:
    return TestClient(create_app(reranker=reranker, api_token=token))


def test_rerank_tra_diem_theo_thu_tu_dau_vao_va_ten_mo_hinh() -> None:
    fake = FakeReranker()
    response = client(fake).post(
        "/rerank",
        json={"query": "ship COD không", "documents": ["phí ship", "đổi trả", "bảo hành"]},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["model"] == "bge-reranker-v2-m3"
    assert body["scores"] == [1.0, 0.5, 1.0 / 3]
    assert fake.calls == [("ship COD không", ["phí ship", "đổi trả", "bảo hành"])]


def test_rerank_tat_mac_dinh_tra_503_khong_nap_model(monkeypatch) -> None:
    monkeypatch.delenv("ML_RERANK_ENABLED", raising=False)
    response = TestClient(create_app()).post("/rerank", json={"query": "a", "documents": ["b"]})
    assert response.status_code == 503
    assert response.json()["detail"] == "rerank_disabled"


def test_rerank_thieu_thu_vien_tra_503_unavailable() -> None:
    response = client(BrokenReranker()).post("/rerank", json={"query": "a", "documents": ["b"]})
    assert response.status_code == 503
    assert response.json()["detail"] == "rerank_unavailable"


def test_rerank_so_diem_khong_khop_so_tai_lieu_tra_502() -> None:
    response = client(FakeReranker(count_delta=1)).post(
        "/rerank", json={"query": "a", "documents": ["b", "c"]}
    )
    assert response.status_code == 502
    assert response.json()["detail"] == "rerank_bad_shape"


def test_rerank_gioi_han_dau_vao() -> None:
    fake = FakeReranker()
    assert client(fake).post("/rerank", json={"query": "a", "documents": []}).status_code == 422
    assert (
        client(fake)
        .post("/rerank", json={"query": "a", "documents": ["x"] * (MAX_DOCUMENTS + 1)})
        .status_code
        == 422
    )
    assert client(fake).post("/rerank", json={"query": "", "documents": ["x"]}).status_code == 422
    assert (
        client(fake)
        .post("/rerank", json={"query": "a", "documents": ["x" * (MAX_CHARS + 1)]})
        .status_code
        == 422
    )


def test_rerank_bat_buoc_token_khi_da_dat() -> None:
    fake = FakeReranker()
    body = {"query": "a", "documents": ["b"]}
    assert client(fake, token="s3cret").post("/rerank", json=body).status_code == 401
    ok = client(fake, token="s3cret").post(
        "/rerank", json=body, headers={"Authorization": "Bearer s3cret"}
    )
    assert ok.status_code == 200
