export function trainFrameTimestamp() {
  const frameTime = document.timeline.currentTime;
  return performance.timeOrigin + (typeof frameTime === "number" ? frameTime : performance.now());
}

export const DETAIL_START = 15.9;
export const DETAIL_END = 16.65;
export function detailBlend(zoom: number) {
  const p = Math.max(0, Math.min(1, (zoom - DETAIL_START) / (DETAIL_END - DETAIL_START)));
  return p * p * (3 - 2 * p);
}
