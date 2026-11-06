# Bàn giao `feat-ui-sidebar-reorg` (claude, làn d)

## Đã làm
- `app-nav.ts`: 7 mục chính / 2 nhóm; `parent` cho trang con; `matchHrefs`; `sectionTabsFor`. Test cập nhật (`app-nav.test.ts`, `kb-structure.test.ts`).
- UI: `SectionTabs` (tab Bình luận/Cài đặt), `ShellQuotaCard` (Hạn mức AI thật), CSS, chuỗi vi/en (`shell.groups.system`, `shell.tabs`, `shell.quota`, `shell.tabsLabel`; bỏ `groups.settings`).
- Trang dev mẫu có thẻ hạn mức [MẪU] (2.140/3.000). Ảnh: `docs/plans/ui-fidelity/ui-sidebar-reorg/`.

## File đã đọc + điều rút ra
- `kb-frame.tsx`/`kb-structure.ts` đã là khung phụ của Cơ sở kiến thức → không làm tab riêng cho KB.
- `splitNavByRole` (trang 403) vẫn duyệt toàn bộ mục kể cả trang con.

## Còn lại
- Ảnh chụp bị máy chủ dev cũ (PID 60076 trên cổng 3104, không dừng được) giữ bản dịch JSON cũ nên hiện khóa i18n thô; chụp lại sau khi khởi động lại dev.
- Chụp lại 390px; Tin nhắn/Khách tiềm năng/Báo cáo thêm vào `ENTRIES` khi trang ra đời; nút "Nâng gói" chờ trang gói cước.
