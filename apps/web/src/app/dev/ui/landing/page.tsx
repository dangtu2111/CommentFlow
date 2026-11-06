import { notFound } from 'next/navigation';
import { LandingHero } from '../../../../components/public/landing-hero';
import {
  Benefits,
  FaqList,
  FinalCta,
  FlowSteps,
  PricingTable,
} from '../../../../components/public/landing-sections';
import { PublicShell } from '../../../../components/public/public-shell';

/**
 * Giao diện Landing + Bảng giá (design/stitch/landing-pricing.html, dựng bằng Tailwind) với DỮ LIỆU MẪU — CHỈ khi
 * `NODE_ENV !== 'production'` (QRL1, QTWAL1). Bỏ huy hiệu "Meta Tech Partner", "98.6%", số shop, giá thật, nút Google/Facebook.
 */
export default function DevLandingPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <PublicShell>
      <LandingHero />
      <Benefits />
      <FlowSteps />
      <PricingTable />
      <FaqList />
      <FinalCta />
    </PublicShell>
  );
}
