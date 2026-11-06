## 2h. Nhận diện ngôn ngữ (lingua) — `PIPE-NORMALIZE-LANG` (FR-025/120/159, Xong-mock, mã KT-033)

Không cần khóa hay dịch vụ ngoài: `normalizeAndDetectLang` chạy bằng heuristic từ khóa mặc định. Muốn độ chính xác cao hơn cho câu không dấu/ngôn ngữ Latin khác (Pháp, Tây Ban Nha…), bạn **quyết định** có thêm thư viện lingua (MIT) hay không — khi đó sẽ cắm qua interface `LangDetector`, kèm bộ đánh giá 4 nhóm (FR-120). Từ điển viết tắt lấy từ bảng `abbreviations` (việc ABBREV-DICT).
