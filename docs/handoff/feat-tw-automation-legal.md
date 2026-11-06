# Handoff `feat-tw-automation-legal` (làn d, claude)

**Đã làm:** dựng lại `/app/automation`, `/app/spam-rules` và 5 route `/dev/ui/{automation,spam-rules,landing,privacy,terms}` bằng Tailwind (khung `.tw`), nguồn `design/stitch/*.html`. File mới dùng chung: `components/ui/tw-form.tsx` (Toggle, Notice, FIELD_CLASS), `tw-platform-badge.tsx`; trang công khai ở `components/public/*`. Đường lưu cấu hình/quy tắc giữ nguyên (Server Action + test cũ xanh). Quyết định: `docs/plans/quyet-dinh/qtwal1.md`.

**File đã đọc + điều rút ra:** luật lint i18n chỉ miễn prop `variant|tone|size|icon|className` → đặt tên prop theo đó; `components/public/**` và `app/dev/**` được miễn lint i18n. `automation.css` còn `.link-button` vì form 2FA dùng.

**Còn lại:**
- `pnpm ui:fidelity` đã đo ở 1440px (máy 3103): Tự động hóa 96,5%, Quy tắc spam 78% (tab Quy tắc; tab Nhật ký thêm phần còn lại), Landing 57%, Quyền riêng tư 59%, Điều khoản 44% — phần thiếu ở trang công khai là cam kết/số liệu/huy hiệu/liên hệ pháp lý không có thật, cố ý thay. Chưa đo 1920px.
- Gỡ `import` 6 CSS rỗng ở `app/layout.tsx` (PR `[CHUNG]`).
- Trang công khai thật + duyệt pháp lý: `PUBLIC-PAGES`. Chức năng cho nút "Sắp có": xem `UI-HTML-AUTOMATION`.
