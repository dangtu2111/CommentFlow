# Kế hoạch `chore-single-agent-workflow` — bỏ multi-agent khỏi quy trình

> Trạng thái duyệt: **Đã duyệt** (chủ dự án yêu cầu 07/11/2026: "không multiagent nữa, sửa lại workflow").

## Việc

Mã gap matrix: không · Spec: `CLAUDE.md`, `AGENTS.md`, `docs/workflows/*`.

**Tóm tắt:** quy trình chuyển sang một phiên, một nhánh, tuần tự; không gọi subagent. Kiểm chứng nhạy cảm thành bước tự kiểm có nhãn, không tự merge. Tài liệu song song/orchestrator giữ lại, đánh dấu tạm dừng. Không đổi mã chạy.

## Điểm chưa rõ

Không có.

## Tiêu chí nghiệm thu

1. `CLAUDE.md` không còn hướng dẫn gọi subagent/làn Haiku — kiểm bằng: đọc diff.
2. `finish.md`, `verify.md`, `feature.md`, `stitch-sync.md`, `AGENTS.md` khớp quy tắc mới — kiểm bằng: grep "verifier-" trong `docs/workflows` và `AGENTS.md` không còn chỉ dẫn gọi.
3. Công cụ xanh — kiểm bằng: `pnpm precheck`.

## File sẽ đọc

`CLAUDE.md`, `AGENTS.md`, `docs/workflows/{feature,finish,verify,stitch-sync,parallel,orchestrator}.md`.

## File sẽ sửa / tạo

Các file trên và `docs/plans/chore-single-agent-workflow.md`.

## Migration

Không có.

## Test viết trước

Không áp dụng (chỉ tài liệu).

## Lệnh test phạm vi hẹp

`pnpm check:plans`
