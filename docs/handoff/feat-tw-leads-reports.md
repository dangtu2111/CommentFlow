# Handoff `feat-tw-leads-reports` (làn d, claude)

**Đã làm:** dựng lại `/app/leads`, `/app/reports`, `/app/activity` và 3 route `/dev/ui/*` bằng Tailwind (khung `.tw`), nguồn `design/stitch/{leads,reports,activity-log}.html`. Kit mới: `components/ui/tw-parts.tsx`. Dữ liệu thật giữ nguyên đường đọc; khối thiếu nguồn dùng `lib/{leads,reports,activity}-sample.ts` chỉ khi `showSampleData()`/route dev. Quyết định: `docs/plans/quyet-dinh/qtwlr1.md`.

**File đã đọc + điều rút ra:** `eslint.config.mjs` chỉ miễn các prop `variant|tone|size|icon|className|...` khỏi luật chuỗi cứng → đặt prop component theo các tên đó; mảng literal trong JSX bị cờ → đưa lên hằng module. `ui:fidelity` trên git-bash cần route dạng `//dev/ui/<tên>` (tránh đổi đường dẫn).

**Chưa làm / còn lại:**
- Bảng `pnpm ui:fidelity` ≥ 95% (1440/1920px): máy chủ xem trước http://localhost:3103 đang giữ bản dịch cũ nên khớp chỉ 28–46% giả; cần khởi động lại máy chủ xem trước rồi chạy lại 3 lệnh `pnpm ui:fidelity <slug> //dev/ui/<tên> --base http://localhost:3103`. Chữ cố ý khác HTML: xem QTWLR1.
- Gỡ 3 dòng `import '../styles/{leads,reports,activity}.css'` ở `app/layout.tsx` (PR `[CHUNG]`), rồi xóa 3 file CSS rỗng.
- Chức năng thật cho nút "Sắp có": xem gap `LEADS-KANBAN`, `REPORTS-*`, `LOG-PAGE`.
