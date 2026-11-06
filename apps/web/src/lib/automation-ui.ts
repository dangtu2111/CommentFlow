export type ModeTone = 'auto' | 'shadow' | 'off';

/** Tông màu viên của một mức tự gửi (giao diện Tự động hóa); giá trị lạ → `off` (an toàn, trung tính). */
export function modeTone(mode: string | undefined): ModeTone {
  return mode === 'auto' || mode === 'shadow' ? mode : 'off';
}
