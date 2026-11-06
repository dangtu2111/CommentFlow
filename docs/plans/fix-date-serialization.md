# Kế hoạch: sửa lỗi `toISOString is not a function` khi ngày về dạng chuỗi

Trạng thái: Đã duyệt

Chủ dự án báo trang lỗi `item.createdTime?.toISOString is not a function`. Nguyên nhân: giá trị ngày đi qua ranh giới server→client/JSON có thể là chuỗi hoặc số thay vì `Date`, nhưng thành phần gọi thẳng `.toISOString()`. Sửa: hàm `toDate`/`toIsoString` chịu được Date, chuỗi ISO, số, null; thay các lời gọi trực tiếp ở danh sách bình luận, chi tiết bình luận, nhật ký hoạt động, bảng khách tiềm năng; test hồi quy.

## Tiêu chí nghiệm thu
- Trang bình luận/nhật ký/khách tiềm năng không ném lỗi khi ngày là chuỗi ISO.
- Test hồi quy `inbox-format.dates.test.ts` xanh.
