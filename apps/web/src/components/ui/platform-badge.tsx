import { Camera, Globe, Music2, ThumbsUp } from 'lucide-react';

const ICONS = {
  facebook: ThumbsUp,
  instagram: Camera,
  tiktok: Music2,
} as const;

/** Ô vuông nhỏ có biểu tượng nền tảng (Facebook/Instagram/TikTok); nền tảng lạ → quả cầu. Chỉ để trang trí. */
export function PlatformBadge({ platform }: { platform: string }) {
  const known = platform in ICONS;
  const Icon = known ? ICONS[platform as keyof typeof ICONS] : Globe;
  return (
    <span className={`platform-badge is-${known ? platform : 'other'}`} aria-hidden="true">
      <Icon size={14} />
    </span>
  );
}
