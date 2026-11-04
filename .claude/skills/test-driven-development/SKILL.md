---
name: test-driven-development
description: Dùng khi viết tính năng hoặc sửa lỗi, TRƯỚC khi viết mã sản phẩm — test đỏ trước, mã tối thiểu cho xanh, rồi dọn. Bắt buộc với logic quy tắc (cổng tự gửi, sendRecheck, decideAction, che PII, hạn mức…).
---

# TDD (test trước) — CommentFlow

> Phỏng theo skill `test-driven-development` của obra/superpowers (MIT, © 2025 Jesse Vincent), bản dịch/chỉnh cho repo này. Nguồn, commit và giấy phép: `docs/decisions/006-skills.md`. Chuẩn test của repo: `docs/testing/STANDARD.md`.

**Nguyên tắc:** chưa thấy test đỏ thì chưa biết test có kiểm đúng điều cần kiểm.

## Luật sắt

```
KHÔNG CÓ MÃ SẢN PHẨM NÀO KHÔNG CÓ TEST ĐỎ TRƯỚC
```

Lỡ viết mã trước test → xóa mã, viết lại từ test. Không giữ làm "tham khảo".

Áp dụng: tính năng mới, sửa lỗi (test hồi quy), đổi hành vi, tái cấu trúc. Ngoại lệ (hỏi chủ dự án): bản thử bỏ đi, mã sinh tự động, file cấu hình. Logic quy tắc ở `docs/testing/STANDARD.md` §4 thì **không có ngoại lệ**.

## Vòng Đỏ → Xanh → Dọn

1. **ĐỎ** — một test, một hành vi, tên mô tả hành vi, mã thật (không mock trừ khi bất khả kháng). Tên test mang mã FR/US (`describe('FR-034 …')`) theo `STANDARD.md` §2.
   Trước khi viết, nói ra: thay đổi nào ở mã sản phẩm sẽ làm test này đỏ?
2. **Chạy và xem nó đỏ** (bắt buộc): `pnpm --filter <gói> exec vitest run <file>`. Đỏ vì thiếu tính năng, không phải vì gõ sai/lỗi import. Test xanh ngay = đang test hành vi đã có → sửa test.
3. **XANH** — mã đơn giản nhất cho test qua. Không thêm tùy chọn, không "tiện thể" cải tiến (YAGNI).
4. **Chạy lại** — test xanh, test khác vẫn xanh, output sạch. "Test khác" là cả bộ của gói (`pnpm --filter <gói> test`), không chỉ file mình viết; lỗi nào hiện ra (kể cả không do mình) phải nêu tên trong báo cáo.
5. **DỌN** — chỉ khi xanh: bỏ lặp, đặt tên lại, tách hàm. Không thêm hành vi.

## Test tốt

| Tiêu chí | Tốt | Xấu |
|---|---|---|
| Nhỏ | Một ý. Tên có "và" → tách | `validates email and domain and whitespace` |
| Rõ | Tên nói hành vi | `test1`, `works` |
| Thật | Kiểm hành vi của mã | Kiểm hành vi của mock |

- Không để mã chỉ-dùng-cho-test trong lớp sản phẩm.
- Hiểu tác dụng phụ của thứ định mock trước khi mock.
- Test tích hợp dùng DB thật `cf_test`, không mock `withWorkspace`/RLS.

## Bao biện thường gặp

| Lời bào chữa | Sự thật |
|---|---|
| "Quá đơn giản để test" | Mã đơn giản vẫn hỏng; test mất 30 giây |
| "Test sau cũng được" | Test viết sau qua ngay → không chứng minh gì; chỉ kiểm điều đã nhớ |
| "Đã thử tay rồi" | Không lưu vết, không chạy lại được |
| "Xóa mã đã viết thì phí" | Chi phí chìm; giữ mã không tin cậy mới là phí |
| "Cần khám phá trước" | Được — bỏ phần khám phá, rồi bắt đầu bằng test |
| "Khó test" | Thiết kế chưa rõ/ghép quá chặt; đơn giản hóa giao diện |

## Dấu hiệu phải dừng và làm lại

Mã trước test · test xanh ngay · không giải thích được vì sao đỏ · "test sau" · "lần này ngoại lệ" · "đã thử tay rồi".

## Sửa lỗi

Có lỗi → viết test tái hiện (đỏ) → sửa → xanh. Không sửa lỗi mà không có test. Muốn chắc test hồi quy thật sự bắt lỗi: bỏ bản sửa → test phải đỏ → khôi phục → xanh.

## Kiểm trước khi coi là xong

- [ ] Mỗi hàm/hành vi mới có test; đã thấy từng test đỏ đúng lý do
- [ ] Mã tối thiểu; cả bộ test của gói xanh, output sạch
- [ ] Trường hợp biên và lỗi đã phủ; tên test có mã FR/US
