/**
 * Giữ đường dẫn cũ của chuỗi xử lý một lượt: lõi nay nằm ở `../pipeline/run-pipeline` (MỘT hàm dùng chung cho ô Thử AI và worker,
 * docs/09 §4). File này chỉ re-export để các nơi đang import `./try-pipeline` không phải đổi.
 */
export * from '../pipeline/run-pipeline';
