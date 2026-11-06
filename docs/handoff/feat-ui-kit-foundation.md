# Bàn giao — nhánh `feat-ui-kit-foundation`

Cập nhật: 06/11/2026 · Mục gap matrix: UI-KIT · Agent vừa làm: claude · Commit cuối: xem `git log`
Kế hoạch: `docs/plans/feat-ui-kit-foundation.md`

## Đã làm (PR1)
- Tách nguyên văn 868 dòng CSS nguyên thủy khỏi `globals.css` (3101 → 2277 dòng) sang `components/ui/*.css` (12 file + barrel `ui.css` nạp TRƯỚC `globals.css`).
- Thành phần mới: Button/IconButton, Chip, Card, Avatar, Stat, Tabs, Breadcrumb/PageHeader, SplitLayout, FormField. `fields.tsx` dùng FormField (bỏ FieldShell trùng).
- Chuyển sang kit: auth-shell (Tabs), section-tabs (Tabs), settings-frame (Breadcrumb+SplitLayout), account-card, members-view, activity-list (Avatar/Chip/Stat/PageHeader), dialog (Chip, buttonClass).
- `/dev/ui/kit`, `architecture.test.ts`, luật depcruise `kit-giao-dien-khong-import-trang`, token `tone` được miễn ở lint:i18n.
- Kiểm không đổi giao diện: so computed style + bounding box mọi phần tử, 19 route × (1440, 390) trước/sau (script tạm `e2e/.tmp-snap.mjs`, không commit). Khác biệt duy nhất: viền nút Facebook (Q-UIKIT1).

## Đã đọc và rút ra
| File | Điều cần nhớ |
|---|---|
| `styles/globals.css` (nay 2277 dòng) | Thứ tự cascade quan trọng: nạp kit sau globals làm `.card` đè `.stepper` → kit phải nạp trước |
| `styles/tokens.css` | Token đã khớp docs/08 §2; thêm token mới chỉ khi lặp lại ≥ 2 literal |

## Quyết định đã chốt trong phiên
- Q-UIKIT1 (`docs/plans/quyet-dinh/q-uikit1.md`).

## Còn lại (theo thứ tự)
1. PR2 — gộp ba hệ tab (`.inbox-tabs`, `.posts-tabs`, `.msg-tabs`) vào `Tabs` (thêm biến thể có số đếm/chấm trạng thái); gộp avatar `.inbox-avatar`/`.msg-avatar`/`.auto-avatar`/`.user-avatar` vào `Avatar`; chip trong inbox (`chip-status`/`chip-tone-*`) → `Chip`/`StatusPill`; nút còn dùng `className="btn …"` → `Button`/`buttonClass`.
2. PR2 — dọn khối trùng trong `globals.css`: `.member-item`, `.session-item`, `.comment-detail-head`, `.log-header`, `.stepper*` (2 lần, `stepper-text` đụng `frames.css`), `.banner`/`.banners`, `.reply-section`.
3. PR3 — chuyển nhóm 2 (kiến thức, bài viết, tự gửi, spam, lead, báo cáo, tin nhắn); thêm EmptyState/Table/AppShell/Stepper khi có ≥ 2 nơi dùng; xóa phần thừa của `globals.css`; báo số dòng trước–sau.
4. So bounding box với HTML Stitch (`design/stitch/*.html`) cho từng màn khi chuyển (chưa làm ở PR1: chỉ giữ nguyên giao diện hiện có).

## Lệnh test liên quan
```
pnpm --filter @flow/web exec vitest run src/components/ui src/architecture.test.ts
pnpm lint:i18n && pnpm typecheck && pnpm depcruise
# so computed style (cần dev server riêng): pnpm --filter @flow/e2e exec node .tmp-snap.mjs <out.json> http://localhost:<cổng>
```
