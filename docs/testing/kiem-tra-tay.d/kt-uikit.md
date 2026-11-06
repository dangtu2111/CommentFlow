## KT-UIKIT — Bộ thành phần dùng chung (UI-KIT, feat-ui-kit-foundation)

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Chạy dev, mở /dev/ui/kit | Thấy nút, chip, avatar, ô nhập (có gợi ý + lỗi), tab, banner, hộp thoại, bố cục 2 cột; mọi chữ mang nhãn [MẪU] |
| 2 | Bấm "Mở hộp thoại", nhấn Esc | Hộp thoại mở/đóng |
| 3 | Mở /login, /app/settings, /app/members (đã đăng nhập), /app/activity | Giao diện giống trước khi tách kit (tab đăng nhập, cột trái Cài đặt, danh sách thành viên) |
| 4 | Nút "Tiếp tục với Facebook" ở /login | Có viền xám nhạt quanh nút (trước đây viền trong suốt) |
| 5 | Thu cửa sổ còn 390px ở /app/settings | Cột trái thành dải cuộn ngang, không cuộn ngang cả trang |
| 6 | Chạy production build, mở /dev/ui/kit | 404 |
