import hmac
import os
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field, StringConstraints

from app.embedding import (
    DIMENSIONS,
    MAX_CHARS,
    MAX_TEXTS,
    MODEL_LABEL,
    Embedder,
    EmbeddingUnavailableError,
    SentenceTransformerEmbedder,
)
from app.rerank import (
    MAX_CHARS as RERANK_MAX_CHARS,
)
from app.rerank import (
    MAX_DOCUMENTS,
    CrossEncoderReranker,
    Reranker,
    RerankUnavailableError,
)
from app.rerank import (
    MODEL_LABEL as RERANK_MODEL_LABEL,
)

Text = Annotated[str, StringConstraints(min_length=1, max_length=MAX_CHARS)]


class EmbedRequest(BaseModel):
    texts: list[Text] = Field(min_length=1, max_length=MAX_TEXTS)


class EmbedResponse(BaseModel):
    model: str
    dimensions: int
    vectors: list[list[float]]


RerankText = Annotated[str, StringConstraints(min_length=1, max_length=RERANK_MAX_CHARS)]


class RerankRequest(BaseModel):
    query: RerankText
    documents: list[RerankText] = Field(min_length=1, max_length=MAX_DOCUMENTS)


class RerankResponse(BaseModel):
    model: str
    scores: list[float]


def _default_reranker() -> Reranker | None:
    """Chỉ bật khi `ML_RERANK_ENABLED=true` (mặc định TẮT: không nạp model nặng ngoài ý muốn)."""
    if os.environ.get("ML_RERANK_ENABLED") == "true":
        return CrossEncoderReranker()
    return None


def _default_embedder() -> Embedder | None:
    """Chỉ bật khi `ML_EMBED_ENABLED=true` (mặc định TẮT: không nạp model nặng ngoài ý muốn)."""
    if os.environ.get("ML_EMBED_ENABLED") == "true":
        return SentenceTransformerEmbedder()
    return None


def create_app(
    embedder: Embedder | None = None,
    api_token: str | None = None,
    reranker: Reranker | None = None,
) -> FastAPI:
    """Tạo ứng dụng FastAPI: `/health`, `/embed` (bge-m3), `/rerank` (bge-reranker-v2-m3)."""
    app = FastAPI(title="flow-ml", docs_url=None, redoc_url=None, openapi_url=None)
    engine = embedder if embedder is not None else _default_embedder()
    ranker = reranker if reranker is not None else _default_reranker()
    token = api_token if api_token is not None else os.environ.get("ML_API_TOKEN") or None

    def require_token(authorization: str | None = Header(default=None)) -> None:
        # Có đặt ML_API_TOKEN thì bắt buộc Bearer đúng (so sánh thời gian hằng);
        # không đặt = mạng nội bộ tin cậy.
        if token is None:
            return
        expected = f"Bearer {token}"
        if authorization is None or not hmac.compare_digest(authorization, expected):
            raise HTTPException(status_code=401, detail="unauthorized")

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "service": "ml"}

    @app.post("/embed", response_model=EmbedResponse, dependencies=[Depends(require_token)])
    def embed(body: EmbedRequest) -> EmbedResponse:
        if engine is None:
            raise HTTPException(status_code=503, detail="embedding_disabled")
        try:
            vectors = engine.embed(body.texts)
        except EmbeddingUnavailableError as error:
            raise HTTPException(status_code=503, detail="embedding_unavailable") from error
        if len(vectors) != len(body.texts) or any(len(v) != DIMENSIONS for v in vectors):
            # Không trả vector sai chiều: ghi vào halfvec(1024) sẽ hỏng cả chỉ mục.
            raise HTTPException(status_code=502, detail="embedding_bad_shape")
        return EmbedResponse(model=MODEL_LABEL, dimensions=DIMENSIONS, vectors=vectors)

    @app.post("/rerank", response_model=RerankResponse, dependencies=[Depends(require_token)])
    def rerank(body: RerankRequest) -> RerankResponse:
        if ranker is None:
            raise HTTPException(status_code=503, detail="rerank_disabled")
        try:
            scores = ranker.rerank(body.query, body.documents)
        except RerankUnavailableError as error:
            raise HTTPException(status_code=503, detail="rerank_unavailable") from error
        if len(scores) != len(body.documents):
            # Không trả điểm lệch số tài liệu: nơi gọi ghép điểm theo thứ tự.
            raise HTTPException(status_code=502, detail="rerank_bad_shape")
        return RerankResponse(model=RERANK_MODEL_LABEL, scores=scores)

    return app


app = create_app()
