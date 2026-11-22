import { bridgeCenter } from "./bridge-alignment";
export type Phase = "midnight" | "dawn" | "sunrise" | "midday" | "sunset" | "bluehour" | "night";
export const PHASES: Phase[] = [
  "midnight",
  "dawn",
  "sunrise",
  "midday",
  "sunset",
  "bluehour",
  "night",
];
export const PRESETS: Record<Phase, [string, string]> = {
  midnight: ["한밤", "00:30"],
  dawn: ["새벽", "07:00"],
  sunrise: ["일출", "07:30"],
  midday: ["한낮", "12:17"],
  sunset: ["노을", "17:16"],
  bluehour: ["저녁 블루아워", "17:40"],
  night: ["밤", "22:30"],
};
type Vec = [number, number, number];
const rad = Math.PI / 180,
  clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (t: number) => t * t * (3 - 2 * t);
const wrap = (n: number, m: number) => ((n % m) + m) % m;
// NOAA의 표준 대기 굴절 근사. 11월 노을처럼 지평선 근처에서는 기하 고도와 조명 방향이 달라진다.
function apparentElevation(h: number) {
  if (h > 85) return h;
  const tangent = Math.tan(h * rad);
  const seconds =
    h > 5
      ? 58.1 / tangent - 0.07 / tangent ** 3 + 0.000086 / tangent ** 5
      : h > -0.575
        ? 1735 + h * (-518.2 + h * (103.4 + h * (-12.79 + h * 0.711)))
        : -20.772 / tangent;
  return h + seconds / 3600;
}
export function solarPosition(epoch: number) {
  const jd = epoch / 86400000 + 2440587.5,
    t = (jd - 2451545) / 36525;
  const mean = wrap(280.46646 + t * (36000.76983 + 0.0003032 * t), 360);
  const anomaly = (357.52911 + t * (35999.05029 - 0.0001537 * t)) * rad;
  const ecc = 0.016708634 - t * (0.000042037 + 0.0000001267 * t),
    omega = (125.04 - 1934.136 * t) * rad;
  const center =
    (1.914602 - t * (0.004817 + 0.000014 * t)) * Math.sin(anomaly) +
    (0.019993 - 0.000101 * t) * Math.sin(2 * anomaly) +
    0.000289 * Math.sin(3 * anomaly);
  const lambda = (mean + center - 0.00569 - 0.00478 * Math.sin(omega)) * rad;
  const eps =
    (23 +
      (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60 +
      0.00256 * Math.cos(omega)) *
    rad;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda)),
    y = Math.tan(eps / 2) ** 2,
    l = mean * rad;
  const eot =
    (4 / rad) *
    (y * Math.sin(2 * l) -
      2 * ecc * Math.sin(anomaly) +
      4 * ecc * y * Math.sin(anomaly) * Math.cos(2 * l) -
      0.5 * y * y * Math.sin(4 * l) -
      1.25 * ecc * ecc * Math.sin(2 * anomaly));
  const ha =
      (wrap(wrap(epoch, 86400000) / 60000 + eot + 4 * bridgeCenter[0], 1440) / 4 - 180) * rad,
    lat = bridgeCenter[1] * rad;
  const geometricElevation =
    Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha)) / rad;
  const elevation = apparentElevation(geometricElevation);
  const azimuth = wrap(
    Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat)) / rad +
      180,
    360,
  );
  const az = azimuth * rad,
    el = elevation * rad;
  return {
    elevation,
    geometricElevation,
    azimuth,
    direction: [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)] as Vec,
  };
}

function oklab(hex: string): Vec {
  const rgb = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const [r, g, b] = rgb;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b),
    m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b),
    s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
export function mixOk(a: string, b: string, t: number) {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const p = oklab(a),
    q = oklab(b),
    [L, A, B] = p.map((v, i) => v + (q[i] - v) * t);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3,
    m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3,
    s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return (
    "#" +
    [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ]
      .map((v) =>
        Math.round(clamp(v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055) * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
export function slerp(a: Vec, b: Vec, t: number): Vec {
  const angle = Math.acos(
    Math.max(
      -1,
      Math.min(
        1,
        a.reduce((s, v, i) => s + v * b[i], 0),
      ),
    ),
  );
  const d = Math.sin(angle);
  if (Math.abs(d) < 1e-7) return a;
  return a.map((v, i) => (v * Math.sin((1 - t) * angle) + b[i] * Math.sin(t * angle)) / d) as Vec;
}

interface Tokens {
  sky: string;
  horizon: string;
  land: string;
  water: string;
  park: string;
  facade: string;
  road: string;
  sun: string;
  hemi: string;
  bounce: string;
  power: number;
  fill: number;
  ambient: number;
  lit: number;
  cabin: number;
  bloom: number;
}
const row = (
  sky: string,
  horizon: string,
  land: string,
  water: string,
  park: string,
  facade: string,
  road: string,
  sun: string,
  hemi: string,
  bounce: string,
  power: number,
  fill: number,
  ambient: number,
  lit: number,
  cabin: number,
  bloom: number,
): Tokens => ({
  sky,
  horizon,
  land,
  water,
  park,
  facade,
  road,
  sun,
  hemi,
  bounce,
  power,
  fill,
  ambient,
  lit,
  cabin,
  bloom,
});
const tokens: Record<Phase, Tokens> = {
  midnight: row(
    "#05060C",
    "#10182C",
    "#0E1218",
    "#071321",
    "#0C130E",
    "#273141",
    "#303844",
    "#FFF2D5",
    "#1A2240",
    "#0A0C10",
    0,
    0.22,
    0.12,
    0.12,
    0,
    0.7,
  ),
  dawn: row(
    "#1C2949",
    "#95859B",
    "#161C2A",
    "#142C45",
    "#263327",
    "#424659",
    "#4D5562",
    "#FFD0A0",
    "#526785",
    "#252A36",
    0.04,
    0.35,
    0.22,
    0.18,
    0.85,
    0.62,
  ),
  sunrise: row(
    "#78ABD0",
    "#FFD2A8",
    "#EDE0CF",
    "#77ACC0",
    "#8AC47A",
    "#EFE4D8",
    "#F7F0E6",
    "#FFD4A0",
    "#F0C8A0",
    "#C8B49A",
    0.72,
    0.48,
    0.38,
    0.04,
    0.05,
    0.18,
  ),
  midday: row(
    "#6BB0EE",
    "#D2E8FA",
    "#F0EBE2",
    "#2E86B8",
    "#8FBC68",
    "#F2EDE4",
    "#FFFFFF",
    "#FFF5E0",
    "#C8E2F8",
    "#D8D2C6",
    1.15,
    0.55,
    0.46,
    0.02,
    0,
    0,
  ),
  sunset: row(
    "#7079A2",
    "#FF9A58",
    "#EED0B0",
    "#4A5A6A",
    "#B8A55A",
    "#F0D2AF",
    "#F8EBD4",
    "#FFB060",
    "#FFB080",
    "#C8A078",
    0.62,
    0.5,
    0.36,
    0.08,
    0.37,
    0.28,
  ),
  bluehour: row(
    "#10203D",
    "#B36B69",
    "#161C2C",
    "#11283C",
    "#182A22",
    "#455064",
    "#3D4858",
    "#FF9050",
    "#385081",
    "#1A2637",
    0.03,
    0.32,
    0.2,
    0.36,
    0.93,
    0.58,
  ),
  night: row(
    "#080E20",
    "#202E4C",
    "#0C1018",
    "#0B1D2B",
    "#101F18",
    "#364053",
    "#344451",
    "#FFF3D6",
    "#273858",
    "#141D2A",
    0,
    0.24,
    0.14,
    0.5,
    1,
    0.6,
  ),
};
const tunnel: Tokens = row(
  "#0A0A0C",
  "#0A0A0C",
  "#141210",
  "#0A0A0C",
  "#171611",
  "#292722",
  "#292723",
  "#FFFFFF",
  "#A29A7E",
  "#2A2818",
  0,
  0.45,
  0.45,
  0,
  1,
  0.32,
);
export const presetEpoch = (phase: Phase, date = "2026-11-21") =>
  Date.parse(date + "T" + PRESETS[phase][1] + ":00+09:00");
export interface Lighting extends Tokens {
  phase: Phase;
  lightUI: boolean;
  tunnel: boolean;
  direction: Vec;
  elevation: number;
  azimuth: number;
}
function choose(e: number, az: number, hour: number): [Phase, Phase, number] {
  const am = az < 180,
    blue = am ? "dawn" : "bluehour",
    gold = am ? "sunrise" : "sunset";
  if (e < -18) {
    const distance = Math.abs(wrap(hour - 1.75 + 12, 24) - 12);
    const nightMix = 1 - clamp((distance - 1.25) / 1.8);
    return ["night", "midnight", nightMix];
  }
  if (e < -5) return ["night", blue, clamp((e + 18) / 13)];
  if (e < 1) return [blue, gold, clamp((e + 5) / 6)];
  if (e < 10) return [gold, "midday", clamp((e - 1) / 9)];
  return ["midday", "midday", 0];
}
export function illumination(
  epoch: number,
  force: Phase | null = null,
  underground = false,
): Lighting {
  const actual = solarPosition(epoch),
    hour = wrap(epoch / 3600000 + 9, 24);
  const [a, b, t] = force
    ? ([force, force, 0] as const)
    : choose(actual.elevation, actual.azimuth, hour);
  const phase = t < 0.5 ? a : b,
    left = tokens[a],
    right = tokens[b];
  const mixed = { ...left };
  for (const key of Object.keys(left) as (keyof Tokens)[]) {
    if (typeof left[key] === "string") {
      const k = key as "sky";
      mixed[k] = mixOk(left[k], right[k], t);
    } else {
      const k = key as "lit";
      mixed[k] = left[k] + (right[k] - left[k]) * smooth(t);
    }
  }
  // 두 천문 표본 사이를 구면 보간한다. 국면을 고정해도 날짜의 실제 방위를 사용한다.
  const sample = force
    ? presetEpoch(force, new Date(epoch + 9 * 3600000).toISOString().slice(0, 10))
    : epoch;
  const low = Math.floor(sample / 60000) * 60000,
    cel = solarPosition(sample);
  return {
    ...(underground ? tunnel : mixed),
    phase,
    lightUI: !underground && ["sunrise", "midday", "sunset"].includes(phase),
    tunnel: underground,
    direction: underground
      ? [0, 1, 0]
      : slerp(
          solarPosition(low).direction,
          solarPosition(low + 60000).direction,
          (sample - low) / 60000,
        ),
    elevation: underground ? 0 : cel.elevation,
    azimuth: underground ? 0 : cel.azimuth,
  };
}

export const outdoorDarkness = (t: Lighting) => Math.min(1, Math.max(t.cabin, 1 - t.power / 0.52));
