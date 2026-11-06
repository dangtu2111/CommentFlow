# Bàn giao — nhánh `feat-pipe-normalize-lang`

Cập nhật: 2026-11-06 · Mục gap matrix: PIPE-NORMALIZE-LANG · Agent vừa làm: claude (làn d)
Kế hoạch: `docs/plans/feat-pipe-normalize-lang.md`

## Đã làm
- `packages/ai/src/normalize/normalize-lang.ts`: `normalizeText` (NFC, thường, gộp khoảng trắng, mở rộng viết tắt qua `AbbreviationDict`), `normalizeAndDetectLang` (docs/09 §5 quy tắc 0–5), `createAbbreviationDict`, interface `LangDetector`.
- Test TDD (đỏ trước) + property-based (fast-check); coverage `packages/ai` giữ ngưỡng. Q-PNL1, KT-033.

## Đã đọc và rút ra
| File | Điều cần nhớ |
|---|---|
| `docs/09` §5 | Quy tắc 0–5; thứ tự 3→4→5 mơ hồ → Q-PNL1(d) |
| `packages/ai/vitest.config.ts` | Ngưỡng lines 100 / branches 90; `fast-check` có sẵn trong `ai` |

## Còn lại
1. Nối pipeline (PIPE-ROUTE…): gọi `normalizeAndDetectLang` sau `ruleFilter`, lưu `comments.lang`/`messages.lang`; `other` → `decideAction` handoff (FR-159).
2. ABBREV-DICT (làn b): nạp bảng `abbreviations` + từ điển hệ thống thành `AbbreviationDict` (workspace ưu tiên).
3. Cắm lingua thật qua `LangDetector` (thêm thư viện + giấy phép, việc riêng); hiệu chuẩn bộ đánh giá 4 nhóm (FR-120).

## Lệnh test liên quan
```
pnpm --filter @flow/ai exec vitest run src/normalize/normalize-lang.test.ts
pnpm --filter @flow/ai test:coverage
```
