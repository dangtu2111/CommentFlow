# 013 — Tailwind CSS cho giao diện mới

Trạng thái: chủ dự án chốt 06/11/2026. Phạm vi: `apps/web`.

## Vì sao
HTML Stitch vốn viết bằng class Tailwind (và PRD ghi stack Tailwind 3.4). Dựng trang bằng chính class đó, rồi đo lệch hình học so với HTML Stitch, nhanh và sát hơn viết lại thành CSS riêng cho từng trang.

## Gói thêm và giấy phép (đều MIT)
| Gói | Loại | Dùng để |
|---|---|---|
| `tailwindcss` 3.4.x | devDependencies | sinh CSS tiện ích lúc build |
| `postcss`, `autoprefixer` | devDependencies | Next.js chạy Tailwind qua PostCSS |
| `class-variance-authority`, `clsx`, `tailwind-merge` | dependencies (chạy ở trình duyệt, rất nhỏ) | hàm `cn()` và biến thể (`cva`) của kit |

## Cách cùng tồn tại với CSS cũ (không làm vỡ trang đang chạy)
- `corePlugins.preflight = false`: không reset toàn trang.
- `important: '.tw'`: class tiện ích chỉ có hiệu lực **bên trong** phần tử bọc `.tw` → không đè class cũ trùng tên (`.block`, `.table`…). Trang mới bọc nội dung bằng `<div className="tw">`.
- `styles/tailwind.css` có phần reset tối thiểu (box-sizing, viền mặc định, margin 0, nút/ô nhập kế thừa phông) cũng chỉ trong `.tw`/`[data-tw]`.
- Bằng chứng: `node e2e/support/shot-regression.mjs <thư-mục>` chụp 7 trang cũ (1440px và 390px) trước/sau, `--diff` so từng byte ảnh → 0 khác biệt (ảnh ở `docs/plans/ui-fidelity/tailwind-foundation/`).

## Cấu hình
`apps/web/tailwind.config.ts` chép nguyên từ script `tailwind-config` trong `design/stitch/brand-guideline.html` (màu, `borderRadius`, `spacing`, `fontFamily`, `fontSize`). Bản gốc không có `boxShadow` nên không thêm. Màu/biến CSS của trang cũ vẫn ở `styles/tokens.css` (hai bộ cùng tồn tại cho tới khi hết CSS cũ). `darkMode: 'class'` giữ như bản gốc; chế độ tối hiện do `prefers-color-scheme` ở tokens.css, chưa nối với Tailwind — việc của PR port trang.

## Phông và icon
- Phông Be Vietnam Pro vẫn nạp bằng `@fontsource/be-vietnam-pro` (đã tự lưu cục bộ, `font-src 'self'`, không gọi máy chủ ngoài). **Chưa chuyển sang `next/font`**: đổi sẽ đổi tên họ phông của CSS cũ và cần sao chép file woff2; không có lợi ích thêm về CSP. Có thể làm ở PR riêng.
- Icon: `components/ui/icon-paths.ts` (sinh bởi `node e2e/support/fetch-material-icons.mjs --stitch`) ánh xạ 285 tên Material Symbols dùng trong `design/stitch/*.html` → path SVG; `<Icon name=… />` vẽ nội tuyến. Hai tên trong HTML (`gshield`, `spark`) không phải icon Material (không tải được), bỏ qua. Lưu ý: bảng ~100 KB nằm trong bundle client của trang dùng `Icon`; nếu đáng kể thì tách theo trang sau.

## Kit
`Button`, `Card`, `Chip`, `Tabs` và `Input` (mới, dùng trong `fields.tsx`) khai báo biến thể bằng `cva` + `cn()`, giữ nguyên tên/props. Class bên trong vẫn là lớp CSS của kit (không phải tiện ích Tailwind) vì kit cũng chạy ở trang cũ ngoài `.tw`; chuyển từng thành phần sang tiện ích Tailwind khi trang bao quanh đã port (đổi chuỗi trong `cva`, props không đổi).

## Lint
Thử `lint/nursery/useTailwindSortedClasses` của Biome: bật thì nó sắp xếp lại cả class CSS cũ (`rl-card`, `btn`…) → ồn và đổi diff trang cũ, nên **không bật** (biome.json không cho ghi chú, lý do ghi ở đây). Bật lại khi hết CSS cũ.

## Công cụ đối chiếu
`pnpm ui:fidelity <slug> <route> [--base url] [--tolerance 2]` = `ui-completeness.mjs --geometry`: ngoài so chữ, đo hộp bao và padding/margin/cỡ chữ/màu của header, thanh bên, tiêu đề, card, nút chính ở HTML Stitch (file://, cần mạng vì HTML nạp Tailwind CDN) và trang thật; in bảng lệch, ngưỡng mặc định ≤ 2px. Không bắt buộc trong CI. Selector mốc là phỏng đoán (`lib/ui-geometry.mjs`, thêm `data-landmark="card|sidebar|primary-button"` vào trang để đo chính xác).

## Cách gỡ
1. Xóa `import '../styles/tailwind.css'` ở `app/layout.tsx`, các file `tailwind.config.ts`, `postcss.config.mjs`, `styles/tailwind.css`, trang `/dev/ui/tailwind`.
2. `pnpm --filter @flow/web remove tailwindcss postcss autoprefixer` (giữ `cva/clsx/tailwind-merge` nếu kit còn dùng, hoặc gỡ và đổi `cn()` thành nối chuỗi).
3. Trang đã port sang class Tailwind phải viết lại CSS (chỉ khi đã port).
