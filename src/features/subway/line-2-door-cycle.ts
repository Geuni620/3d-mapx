interface StopEvent {
  arrivalMs: number | null;
  departureMs: number;
}

const shut = { open: 0, light: 0, closing: false } as const;

function ease(progress: number) {
  const t = Math.min(1, Math.max(0, progress));
  return t * t * (3 - 2 * t);
}

// 문설주 LED의 상태 순서는 서울교통공사 자료를 따르고, 개폐 시간과 점멸 주기는 시각적 근사다.
export function getDoorCycle(timestampMs: number, event: StopEvent | null) {
  if (!event || event.arrivalMs === null) return shut;
  const duration = event.departureMs - event.arrivalMs;
  const elapsed = timestampMs - event.arrivalMs;
  if (duration < 3_000 || elapsed < 0 || elapsed >= duration) return shut;

  // 아주 짧은 정차에서는 문을 닫은 뒤 출발할 수 있는 범위에서만 전체 동작을 압축한다.
  const scale = Math.min(1, duration / 8_000);
  const openingStart = 900 * scale;
  const openingEnd = 2_700 * scale;
  const closedAt = duration - 650 * scale;
  const closingStart = closedAt - 2_300 * scale;
  if (elapsed >= closedAt) return shut;
  const closing = elapsed >= closingStart;
  const open = closing
    ? 1 - ease((elapsed - closingStart) / (closedAt - closingStart))
    : ease((elapsed - openingStart) / (openingEnd - openingStart));
  const blinking = closing || elapsed < openingStart;
  const phase = closing ? elapsed - closingStart : elapsed;
  const light = blinking ? 0.55 + 0.45 * Math.cos((phase / 950) * 2 * Math.PI) : 1;
  return { open, light, closing };
}
