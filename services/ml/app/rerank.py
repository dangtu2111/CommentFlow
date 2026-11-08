"""Rerank cho CommentFlow (docs/09 §2): bge-reranker-v2-m3 qua dịch vụ ml.

Mô hình `BAAI/bge-reranker-v2-m3` (Apache-2.0) là cross-encoder: chấm ĐIỂM TUYỆT ĐỐI cho từng
cặp (câu hỏi, đoạn) trong 0..1 (sigmoid) — dùng để quyết định đoạn kiến thức có "đủ liên quan"
hay không, không phụ thuộc điểm tương đối RRF. Nạp LƯỜI ở lần gọi đầu (tải ~2,2 GB vào
`HF_HOME`). `sentence-transformers` là phụ thuộc TÙY CHỌN (`uv sync --extra embed`); thiếu thì
`/rerank` trả 503 thay vì làm sập dịch vụ.
"""

from __future__ import annotations

import threading
from typing import Protocol

MODEL_NAME = "BAAI/bge-reranker-v2-m3"
MODEL_LABEL = "bge-reranker-v2-m3"
MAX_DOCUMENTS = 32
MAX_CHARS = 4000


class RerankUnavailableError(RuntimeError):
    """Không nạp được mô hình (thiếu thư viện/tải lỗi)."""


class Reranker(Protocol):
    def rerank(self, query: str, documents: list[str]) -> list[float]: ...


class CrossEncoderReranker:
    """Bản thật: bge-reranker-v2-m3 trên CPU, điểm đã qua sigmoid (0..1)."""

    def __init__(self, model_name: str = MODEL_NAME) -> None:
        self._model_name = model_name
        self._model = None
        self._lock = threading.Lock()

    def _load(self):  # pragma: no cover - cần model thật
        with self._lock:
            if self._model is None:
                try:
                    import torch
                    from sentence_transformers import CrossEncoder
                except ImportError as error:
                    raise RerankUnavailableError("thiếu sentence-transformers") from error
                self._model = CrossEncoder(
                    self._model_name, device="cpu", activation_fn=torch.nn.Sigmoid()
                )
            return self._model

    def rerank(self, query: str, documents: list[str]) -> list[float]:  # pragma: no cover
        model = self._load()
        scores = model.predict(
            [(query, document) for document in documents], batch_size=8, convert_to_numpy=True
        )
        return [float(score) for score in scores]
