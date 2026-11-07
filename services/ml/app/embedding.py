"""Embedding cho CommentFlow (docs/09 §2): bge-m3 qua dịch vụ ml, miễn phí, chạy trong mạng nội bộ.

Mô hình `BAAI/bge-m3` (MIT) cho vector 1024 chiều, khớp cột `halfvec(1024)` của `kb_chunks`.
Nạp LƯỜI ở lần gọi đầu (tải ~2,3 GB vào `HF_HOME`) nên `/health` không bị chậm.
`sentence-transformers` là phụ thuộc TÙY CHỌN (`uv sync --extra embed`); thiếu thì `/embed`
trả 503 thay vì làm sập dịch vụ.
"""

from __future__ import annotations

import threading
from typing import Protocol

MODEL_NAME = "BAAI/bge-m3"
MODEL_LABEL = "bge-m3"
DIMENSIONS = 1024
MAX_TEXTS = 64
MAX_CHARS = 4000


class EmbeddingUnavailableError(RuntimeError):
    """Không nạp được mô hình (thiếu thư viện/tải lỗi)."""


class Embedder(Protocol):
    def embed(self, texts: list[str]) -> list[list[float]]: ...


class SentenceTransformerEmbedder:
    """Bản thật: bge-m3 trên CPU, vector đã chuẩn hóa độ dài 1 (cosine = tích vô hướng)."""

    def __init__(self, model_name: str = MODEL_NAME) -> None:
        self._model_name = model_name
        self._model = None
        self._lock = threading.Lock()

    def _load(self):
        with self._lock:
            if self._model is None:
                try:
                    from sentence_transformers import SentenceTransformer
                except ImportError as error:  # pragma: no cover - chỉ khi thiếu extra `embed`
                    raise EmbeddingUnavailableError("thiếu sentence-transformers") from error
                self._model = SentenceTransformer(self._model_name, device="cpu")
            return self._model

    def embed(self, texts: list[str]) -> list[list[float]]:  # pragma: no cover - cần model thật
        model = self._load()
        vectors = model.encode(
            texts, normalize_embeddings=True, batch_size=16, convert_to_numpy=True
        )
        return [[float(x) for x in vector] for vector in vectors]
