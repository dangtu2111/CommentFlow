---
name: systematic-debugging
description: Dùng khi gặp lỗi, test đỏ, build hỏng hoặc hành vi lạ — tìm nguyên nhân gốc trước khi sửa. Dùng đặc biệt khi đã sửa một lần mà chưa hết.
---

# Gỡ lỗi có hệ thống — CommentFlow

> Phỏng theo skill `systematic-debugging` của obra/superpowers (MIT, © 2025 Jesse Vincent), bản dịch/chỉnh cho repo này. Nguồn, commit và giấy phép: `docs/decisions/006-skills.md`.

**Nguyên tắc:** tìm nguyên nhân gốc trước khi sửa. Sửa triệu chứng là thất bại.

```
KHÔNG SỬA KHI CHƯA ĐIỀU TRA XONG NGUYÊN NHÂN GỐC
```

Dùng cho mọi sự cố: test đỏ, build/CI hỏng, lỗi staging (issue `staging-bug`), hành vi lạ, chậm. Càng dùng khi gấp, khi "có vẻ sửa một dòng là xong", khi sửa lần trước không hiệu quả.

## Bốn pha (xong pha này mới sang pha sau)

**1. Điều tra nguyên nhân gốc**
- Đọc kỹ thông báo lỗi và stack trace đến hết (dòng, file, mã lỗi); đừng lướt qua cảnh báo.
- Tái hiện ổn định: bước chính xác nào, có lần nào không? Chưa tái hiện được → thu thêm dữ liệu, không đoán.
- Xem thay đổi gần đây: `git diff`, `git log`, thư viện/cấu hình/môi trường mới.
- Hệ thống nhiều tầng (web → saas-core → db → RLS, CI → build): thêm log chẩn đoán ở **mỗi ranh giới** (dữ liệu vào/ra, biến môi trường có/không — **không in giá trị bí mật**, không đọc `.env*`), chạy một lần để biết hỏng ở tầng nào, rồi mới đào tầng đó.
- Lỗi sâu trong chuỗi gọi: lần ngược — giá trị sai sinh ra ở đâu, ai gọi với giá trị đó — sửa ở nguồn, không ở nơi lộ triệu chứng.

**2. Phân tích mẫu**
- Tìm mã tương tự đang chạy đúng trong repo; so sánh với mã hỏng; liệt kê **mọi** khác biệt dù nhỏ.
- Đọc trọn mẫu tham chiếu, không đọc lướt. Hiểu phụ thuộc, cấu hình, giả định.

**3. Giả thuyết và thử**
- Nêu một giả thuyết: "Tôi cho rằng X là gốc vì Y". Viết ra.
- Thay đổi nhỏ nhất để thử; mỗi lần một biến. Không sửa nhiều thứ cùng lúc.
- Không đúng → giả thuyết mới, **không** chồng thêm bản sửa. Chưa hiểu thì nói "tôi chưa hiểu X", đừng giả vờ.

**4. Cài đặt bản sửa**
- Viết test đỏ tái hiện lỗi trước (skill `test-driven-development`) — bắt buộc.
- Một bản sửa nhắm nguyên nhân gốc; không "tiện tay" tái cấu trúc.
- Chạy lại: test mới xanh, test khác không vỡ, sự cố hết thật (skill `verification-before-completion`).
- **Sửa 3 lần vẫn không hết → dừng, nghi ngờ kiến trúc** (mỗi bản sửa lộ ra ghép nối/trạng thái chung mới, hoặc cần tái cấu trúc lớn). Không thử lần 4 mà không bàn với chủ dự án; đề xuất ở `docs/decisions/`. (Làn Haiku/máy phụ: sai 2 lần → chuyển máy chính theo `AGENTS.md`.)

## Dấu hiệu phải quay lại pha 1

"Sửa tạm đã, điều tra sau" · "Thử đổi X xem sao" · "Đổi nhiều chỗ rồi chạy" · "Bỏ qua test, tôi thử tay" · "Chắc là X" · "Chưa hiểu hết nhưng có thể được" · đề xuất cách sửa trước khi lần ra luồng dữ liệu · "thêm một lần nữa" khi đã thử ≥ 2.

## Bao biện thường gặp

| Lời bào chữa | Sự thật |
|---|---|
| "Lỗi đơn giản, khỏi quy trình" | Lỗi đơn giản cũng có gốc; quy trình nhanh với lỗi đơn giản |
| "Gấp lắm" | Có hệ thống nhanh hơn đoán mò |
| "Sửa nhiều thứ một lúc cho nhanh" | Không biết cái nào hiệu quả, sinh lỗi mới |
| "Thấy vấn đề rồi" | Thấy triệu chứng ≠ hiểu nguyên nhân |

## Khi điều tra xong mà gốc là môi trường/thời gian/bên ngoài

Ghi lại đã điều tra gì; cài cách xử lý phù hợp (thử lại có hạn, timeout, thông báo lỗi rõ có mã lỗi); thêm log/chỉ số để lần sau. Nhưng 95% ca "không có gốc" là điều tra chưa đủ. Chờ cố định bằng `sleep` không phải cách xử lý — dùng poll có hạn (`docs/testing/STANDARD.md` §7).
