// Nhịp tim của driver: mỗi làn ghi `<làn>.heartbeat` (ISO) định kỳ; janitor báo làn nào im quá lâu.
export const heartbeatMarker = (lane) => `${lane}.heartbeat`;

export function parseTs(text) {
  return text ? Date.parse(text) : Number.NaN;
}

export function isFresh(text, now, ttlMs) {
  const t = parseTs(text);
  return Number.isFinite(t) && now - t <= ttlMs;
}

// Làn đã có nhịp tim, chưa .done/.stuck, mà nhịp cuối cũ hơn silentMs → driver nhiều khả năng đã chết.
export function findSilentLanes({ lanes, heartbeatOf, isFinished, now, silentMs }) {
  const out = [];
  for (const lane of lanes) {
    const ts = heartbeatOf(lane);
    const t = parseTs(ts);
    if (!Number.isFinite(t) || isFinished(lane)) continue;
    if (now - t > silentMs) out.push({ lane, silentMinutes: Math.round((now - t) / 60_000), ts });
  }
  return out;
}

export function startHeartbeat({
  lane,
  intervalMs,
  write,
  log,
  nowIso = () => new Date().toISOString(),
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
}) {
  const beat = () => {
    write(heartbeatMarker(lane), nowIso());
    log('heartbeat');
  };
  beat();
  const timer = setIntervalFn(beat, intervalMs);
  timer?.unref?.();
  return () => clearIntervalFn(timer);
}
