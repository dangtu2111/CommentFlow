## KT-UIPL — Khung nội dung trải hết bề ngang (feat-ui-fix-posts-layout)

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Mở `/app/posts` ở cửa sổ 1920px | Nội dung kéo hết bề ngang sau thanh bên, chỉ còn lề nhỏ 16px hai bên; không còn dải trống lớn |
| 2 | Lặp lại với Cơ sở kiến thức, Tự động hóa, Spam, Tin nhắn | Cùng lề 16px hai bên, nội dung trải hết |
| 3 | Mở Khách tiềm năng và Báo cáo ở 2560px | Nội dung dừng ở 1720px và canh giữa; ở 1920px vẫn trải hết |
| 4 | Mở `/dev/ui/kb-posts` (chỉ dev) | Thẻ cấu hình bên phải chiếm 5/12 bề ngang (không cố định hẹp) |
