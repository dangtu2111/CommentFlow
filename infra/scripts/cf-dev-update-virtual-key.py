"""Cập nhật khóa ảo (virtual key) của LiteLLM trên máy ảo cf-dev. CHẠY TRONG container litellm qua stdin:

  docker exec -i cf-dev-litellm-1 python - <MÃ-BĂM-64-HEX> <model> [<model> ...] --max-budget 10 --duration 30d < file này

Khóa thật KHÔNG đi qua đây: LiteLLM nhận diện khóa bằng mã băm SHA-256 của nó (nên chỉ cần mã băm); master key lấy từ biến môi
trường LITELLM_MASTER_KEY của chính container và không bao giờ được in. Chỉ in các trường an toàn (đầu mã băm, danh sách model,
trần ngân sách, chu kỳ, số đã tiêu). Chỉ project cf-dev (gọi localhost của container).
"""

import json
import os
import re
import sys
import urllib.error
import urllib.request

BASE = "http://localhost:4000"
HASH = re.compile(r"^[0-9a-f]{64}$")
MODEL = re.compile(r"^[A-Za-z0-9_.-]{1,64}$")
DURATION = re.compile(r"^[0-9]{1,4}[smhd]$")


def fail(message: str) -> None:
    print("LỖI:", message)
    sys.exit(1)


def parse(argv: list[str]) -> tuple[str, list[str], float, str]:
    if not argv or not HASH.match(argv[0]):
        fail("tham số đầu tiên phải là mã băm SHA-256 (64 ký tự hex) của khóa ảo")
    key_hash, models, max_budget, duration = argv[0], [], 10.0, "30d"
    i = 1
    while i < len(argv):
        arg = argv[i]
        if arg == "--max-budget" and i + 1 < len(argv):
            try:
                max_budget = float(argv[i + 1])
            except ValueError:
                fail("--max-budget phải là số")
            i += 2
        elif arg == "--duration" and i + 1 < len(argv):
            duration = argv[i + 1]
            i += 2
        elif MODEL.match(arg):
            models.append(arg)
            i += 1
        else:
            fail("tham số không hợp lệ: " + arg[:40])
    if not models:
        fail("cần ít nhất một model")
    if not DURATION.match(duration) or max_budget <= 0:
        fail("--duration dạng 30d/12h, --max-budget > 0")
    return key_hash, models, max_budget, duration


def call(path: str, payload: dict | None = None) -> dict:
    master = os.environ.get("LITELLM_MASTER_KEY", "")
    if not master:
        fail("container không có LITELLM_MASTER_KEY")
    request = urllib.request.Request(
        BASE + path,
        data=None if payload is None else json.dumps(payload).encode(),
        headers={"Authorization": "Bearer " + master, "Content-Type": "application/json"},
        method="GET" if payload is None else "POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        try:
            body = json.loads(error.read().decode() or "{}")
        except ValueError:
            body = {}
        detail = body.get("detail") or body.get("error") or {}
        code = detail.get("code") if isinstance(detail, dict) else None
        fail("LiteLLM trả HTTP %d (%s) ở %s" % (error.code, code or "không rõ", path.split("?")[0]))
        return {}


def summary(key_hash: str) -> dict:
    info = call("/key/info?key=" + key_hash).get("info") or {}
    return {
        "models": info.get("models"),
        "max_budget": info.get("max_budget"),
        "budget_duration": info.get("budget_duration"),
        "spend": info.get("spend"),
    }


def main() -> None:
    key_hash, models, max_budget, duration = parse(sys.argv[1:])
    print("Khóa ảo (đầu mã băm): %s…" % key_hash[:8])
    print("Trước:", json.dumps(summary(key_hash), ensure_ascii=False))
    call(
        "/key/update",
        {"key": key_hash, "models": models, "max_budget": max_budget, "budget_duration": duration},
    )
    after = summary(key_hash)
    print("Sau:  ", json.dumps(after, ensure_ascii=False))
    ok = (
        sorted(after.get("models") or []) == sorted(models)
        and after.get("max_budget") == max_budget
        and after.get("budget_duration") == duration
    )
    print("Kiểm:", "ĐẠT (model, max_budget, budget_duration đúng như yêu cầu)" if ok else "KHÔNG KHỚP")
    sys.exit(0 if ok else 2)


main()
