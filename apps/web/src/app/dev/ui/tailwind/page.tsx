import { notFound } from 'next/navigation';
import { Icon } from '../../../../components/ui/icon';

/** Trang thử nền Tailwind (chỉ DEV): class chép từ HTML Stitch chạy đúng bên trong `.tw`. Dùng cho `pnpm ui:fidelity` và kiểm tay. */
export default function DevTailwindPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <div className="tw min-h-screen bg-surface">
      <div className="p-margin">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">Nền Tailwind</h1>
        <p className="mt-space-sm font-body-md text-body-md text-on-surface-variant">
          Class chép từ HTML Stitch: màu, khoảng cách, cỡ chữ lấy từ tailwind.config.ts.
        </p>
        <section className="mt-space-xl rounded-xl border border-outline-variant bg-surface-container-lowest p-space-xl">
          <h2 className="font-title-md text-title-md text-on-surface">Thẻ mẫu</h2>
          <button
            type="button"
            className="mt-space-lg inline-flex items-center gap-space-sm rounded-lg bg-primary-container px-space-md py-1.5 font-label-md text-label-md text-on-primary"
          >
            <Icon name="auto_mode" size={16} />
            Nút chính
          </button>
        </section>
      </div>
    </div>
  );
}
