from fastapi import FastAPI


def create_app() -> FastAPI:
    """Tạo ứng dụng FastAPI. Giai đoạn khung: chỉ có /health (chưa nạp model)."""
    app = FastAPI(title="flow-ml", docs_url=None, redoc_url=None, openapi_url=None)

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "service": "ml"}

    return app


app = create_app()
