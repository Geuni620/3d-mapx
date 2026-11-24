export function trainFrameTimestamp() {
  const frameTime = document.timeline.currentTime;
  return performance.timeOrigin + (typeof frameTime === "number" ? frameTime : performance.now());
}

export const DETAIL_START = 15.9;
export const DETAIL_END = 16.65;
export const PULSE_DETAIL_START = 15.1;
export function detailBlend(zoom: number, pulse = false) {
  const start = pulse ? PULSE_DETAIL_START : DETAIL_START;
  const end = pulse ? DETAIL_START : DETAIL_END;
  const p = Math.max(0, Math.min(1, (zoom - start) / (end - start)));
  return p * p * (3 - 2 * p);
}
