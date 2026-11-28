export type PulseClipPoint = readonly [x: number, y: number, w: number];

const MIN_DEPTH = 0.001;

export function createPulseSegmentClipper(width: number, height: number, pad = 48) {
  const horizontal = 1 + 2 * pad / width;
  const vertical = 1 + 2 * pad / height;

  // 원근 나눗셈 전에 자르면 높이가 있는 선로도 화면 가장자리와 지평선에서 이어진다.
  return (from: PulseClipPoint, to: PulseClipPoint): [PulseClipPoint, PulseClipPoint] | undefined => {
    let enter = 0;
    let leave = 1;
    const clip = (a: number, b: number) => {
      if (a < 0 && b < 0) return false;
      if (a < 0) enter = Math.max(enter, a / (a - b));
      else if (b < 0) leave = Math.min(leave, a / (a - b));
      return enter < leave;
    };
    const [ax, ay, aw] = from;
    const [bx, by, bw] = to;
    if (!clip(aw - MIN_DEPTH, bw - MIN_DEPTH) ||
        !clip(horizontal * aw + ax, horizontal * bw + bx) ||
        !clip(horizontal * aw - ax, horizontal * bw - bx) ||
        !clip(vertical * aw + ay, vertical * bw + by) ||
        !clip(vertical * aw - ay, vertical * bw - by)) return;
    const sample = (t: number): PulseClipPoint => [
      ax + t * (bx - ax), ay + t * (by - ay), aw + t * (bw - aw),
    ];
    return [enter === 0 ? from : sample(enter), leave === 1 ? to : sample(leave)];
  };
}
