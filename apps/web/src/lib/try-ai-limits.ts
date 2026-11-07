/** Giới hạn độ dài bình luận mẫu của ô Thử AI — dùng chung cho form (client) và server; không kéo `@flow/ai` vào bundle trình duyệt. */
export const TRY_AI_MAX_CHARS = 1000;
/** Ô "lượt trước" của Thử AI (Q-POR12): tối đa ký tự của cả ô (an toàn cho cả client lẫn server). */
export const MAX_PREVIOUS_RAW_CHARS = 4000;
