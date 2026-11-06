import { MessageSquareText } from 'lucide-react';
import Link from 'next/link';
import { getBrand } from '../server/brand';

/** Logo + tên thương hiệu cấu hình được (FR-125). Chưa đặt `APP_LOGO_URL` → biểu tượng mặc định. */
export function BrandLogo({ href }: { href: string }) {
  const { name, logoUrl } = getBrand();
  return (
    <Link href={href} className="brand">
      <span className="brand-mark" aria-hidden="true">
        {logoUrl ? (
          // biome-ignore lint/performance/noImgElement: logo cấu hình từ biến môi trường, URL bất kỳ — không đi qua next/image
          <img src={logoUrl} alt="" width={18} height={18} />
        ) : (
          <MessageSquareText size={18} />
        )}
      </span>
      {name}
    </Link>
  );
}
