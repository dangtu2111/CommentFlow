/**
 * Ghép class có điều kiện bằng chuỗi THUẦN (không `tailwind-merge`). Dùng thay `cn()` khi class có cỡ chữ của Stitch (`text-title-sm`, `text-body-sm`, `text-label-md`…): `cn()` coi chúng là MÀU chữ
 * và xóa khi gặp `text-on-surface`/`text-primary`, làm chữ to hơn thiết kế (xem ghi chú ở `components/ui/pill.tsx`). `className` chỉ để thêm, không để ghi đè.
 */
export function cx(...inputs: Array<string | false | null | undefined>): string {
  return inputs.filter(Boolean).join(' ');
}
