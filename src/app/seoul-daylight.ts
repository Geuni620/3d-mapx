import { SEOUL_CENTER } from "./map-config";

export type MapTheme = "light" | "dark";
export type MapThemePreference = MapTheme | "auto";

const RADIANS = Math.PI / 180;
const DAY_MS = 86_400_000;
const wrap = (value: number, total: number) => ((value % total) + total) % total;

// NOAA/Meeus의 태양 위치 계산. 서울의 위경도와 UTC 타임스탬프를 사용한다.
// 접속 지역의 시간대가 달라도 서울의 태양 고도는 같은 값이다.
export function getSeoulDaylightTheme(timestamp: number): MapTheme {
  const t = (timestamp / DAY_MS + 2440587.5 - 2451545) / 36525;
  const meanLongitude = wrap(280.46646 + t * (36000.76983 + 0.0003032 * t), 360);
  const anomaly = (357.52911 + t * (35999.05029 - 0.0001537 * t)) * RADIANS;
  const eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const omega = (125.04 - 1934.136 * t) * RADIANS;
  const center = (1.914602 - t * (0.004817 + 0.000014 * t)) * Math.sin(anomaly)
    + (0.019993 - 0.000101 * t) * Math.sin(2 * anomaly)
    + 0.000289 * Math.sin(3 * anomaly);
  const apparentLongitude = (meanLongitude + center - 0.00569 - 0.00478 * Math.sin(omega)) * RADIANS;
  const tilt = (23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60
    + 0.00256 * Math.cos(omega)) * RADIANS;
  const declination = Math.asin(Math.sin(tilt) * Math.sin(apparentLongitude));
  const y = Math.tan(tilt / 2) ** 2;
  const longitude = meanLongitude * RADIANS;
  const equationOfTime = (4 / RADIANS) * (
    y * Math.sin(2 * longitude) - 2 * eccentricity * Math.sin(anomaly)
    + 4 * eccentricity * y * Math.sin(anomaly) * Math.cos(2 * longitude)
    - 0.5 * y ** 2 * Math.sin(4 * longitude) - 1.25 * eccentricity ** 2 * Math.sin(2 * anomaly)
  );
  const solarMinutes = wrap(wrap(timestamp, DAY_MS) / 60000 + equationOfTime + 4 * SEOUL_CENTER.longitude, 1440);
  const hourAngle = (solarMinutes / 4 - 180) * RADIANS;
  const latitude = SEOUL_CENTER.latitude * RADIANS;
  const elevation = Math.sin(latitude) * Math.sin(declination)
    + Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle);

  // 태양 반지름과 표준 대기 굴절을 보정한 일출·일몰 경계.
  return elevation >= Math.sin(-0.833 * RADIANS) ? "light" : "dark";
}
