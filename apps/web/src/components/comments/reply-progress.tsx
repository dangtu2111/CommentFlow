'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { QuoteBlock, StateNote } from './state-note';

/** Làm tươi trang mỗi 3 giây khi yêu cầu còn `queued`/`sending`; quá 2 phút thì dừng và nhắc tải lại. */
const REFRESH_MS = 3000;
const GIVE_UP_MS = 120_000;

export function ReplyProgress({
  text,
  labels,
}: {
  text: string;
  labels: { sending: string; slow: string; yourReply: string };
}) {
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
    <StateNote tone="progress" role="status" title={slow ? labels.slow : labels.sending}>
      <p className="mt-1 font-label-md text-label-md text-on-surface-variant">{labels.yourReply}</p>
      <QuoteBlock>{text}</QuoteBlock>
    </StateNote>
  );
}
