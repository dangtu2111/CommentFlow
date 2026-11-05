'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/** Làm tươi trang mỗi 3 giây khi yêu cầu ẩn còn `queued`/`sending`; quá 2 phút thì dừng và nhắc tải lại. */
const REFRESH_MS = 3000;
const GIVE_UP_MS = 120_000;

export function HideProgress({ labels }: { labels: { working: string; slow: string } }) {
  const router = useRouter();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - startedAt > GIVE_UP_MS) {
        setSlow(true);
        clearInterval(timer);
        return;
      }
      router.refresh();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [router]);

  return (
    <div className="reply-state reply-sending" role="status">
      <p className="reply-state-title">{slow ? labels.slow : labels.working}</p>
    </div>
  );
}
