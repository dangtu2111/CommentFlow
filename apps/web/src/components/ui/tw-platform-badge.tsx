import { Icon, type IconName } from './icon';

const PLATFORMS: Record<string, { icon: IconName; box: string }> = {
  facebook: { icon: 'thumb_up', box: 'bg-primary text-on-primary' },
  instagram: { icon: 'photo_camera', box: 'bg-secondary text-on-secondary' },
  tiktok: { icon: 'music_note', box: 'bg-inverse-surface text-inverse-on-surface' },
};
const OTHER = { icon: 'public', box: 'bg-surface-container-high text-on-surface-variant' } as const;

/** Ô vuông nhỏ có biểu tượng nền tảng (Stitch automation.html); nền tảng lạ → quả cầu. Chỉ để trang trí. */
export function TwPlatformBadge({ platform }: { platform: string }) {
  const spec = PLATFORMS[platform] ?? OTHER;
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded p-1 ${spec.box}`}
    >
      <Icon name={spec.icon} size={14} />
    </span>
  );
}
