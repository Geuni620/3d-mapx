import type { SubwayCoordinate } from "./osm-subway-network";
import type { SubwayRouteSampler } from "./subway-route-sampler";
import { SUBWAY_TRAIN_CAR_SPACING_METERS } from "./subway-train-dimensions";
import { DETAIL_START } from "./line-2-main-simulation";

export type Pixel = { x: number; y: number };
export type Viewport = { width: number; height: number };
export type Project = (coordinate: SubwayCoordinate) => Pixel;
export type CarSegment = { front: Pixel; rear: Pixel };

const CAR_PIXELS = 2;
const CAB_PIXELS = 4;
const BODY_WIDTH = 6.8;
const MAX_LENGTH = 10 * CAR_PIXELS + CAB_PIXELS + 2;
const SIZE_BLEND_START = 14.3;
const CAR_HALF_METERS = 9.5;
const CAR_HALF_WIDTH_METERS = 1.56;

export interface OverviewTrainIcon {
  front: Pixel;
  rear: Pixel;
  angle: number;
  carCount: number;
  bodyLength: number;
  bodyWidth: number;
  frontOverhang: number;
  cars?: CarSegment[];
}

// 축소 시 편성 기호를 쓰고, 3D 전환 전에 지도에 투영한 차체 크기에 맞춘다.
export function sampleOverviewTrainIcon(
  sampler: SubwayRouteSampler,
  frontDistanceMeters: number,
  carCount: number,
  project: Project,
  viewport: Viewport,
  zoom = 13,
  coordinate = sampler.sample(frontDistanceMeters).coordinate,
): OverviewTrainIcon | undefined {
  const front = project(coordinate);
  const margin = zoom > SIZE_BLEND_START ? MAX_LENGTH + 450 * 2 ** (zoom - 16) : MAX_LENGTH;
  if (front.x < -margin || front.y < -margin ||
      front.x > viewport.width + margin || front.y > viewport.height + margin) {
    return undefined;
  }
  const behind = project(sampler.sample(frontDistanceMeters - 10).coordinate);
  const ahead = project(sampler.sample(frontDistanceMeters + 10).coordinate);
  const tangent = Math.atan2(ahead.y - behind.y, ahead.x - behind.x);
  let angle = tangent;
  let tail = carCount * CAR_PIXELS;
  let frontOverhang = CAB_PIXELS;
  let bodyWidth = BODY_WIDTH;
  let cars: CarSegment[] | undefined;
  if (zoom > SIZE_BLEND_START) {
    const t = Math.min(1, (zoom - SIZE_BLEND_START) / (DETAIL_START - SIZE_BLEND_START));
    const blend = t * t * (3 - 2 * t);
    const nose = project(sampler.sample(frontDistanceMeters + CAR_HALF_METERS).coordinate);
    const end = project(sampler.sample(
      frontDistanceMeters - (carCount - 1) * SUBWAY_TRAIN_CAR_SPACING_METERS - CAR_HALF_METERS,
    ).coordinate);
    const length = Math.hypot(nose.x - end.x, nose.y - end.y);
    if (length > 0.1) {
      const physicalAngle = Math.atan2(nose.y - end.y, nose.x - end.x);
      const turn = Math.atan2(Math.sin(physicalAngle - angle), Math.cos(physicalAngle - angle));
      angle += blend * turn;
      const overhang = Math.min(length, Math.hypot(nose.x - front.x, nose.y - front.y));
      frontOverhang += blend * (overhang - frontOverhang);
      tail += blend * (length - overhang - tail);
      const heading = sampler.sample(frontDistanceMeters).headingRadians;
      const [lng, lat] = coordinate;
      const side = project([
        lng + Math.cos(heading) * CAR_HALF_WIDTH_METERS / (111320 * Math.cos(lat * Math.PI / 180)),
        lat - Math.sin(heading) * CAR_HALF_WIDTH_METERS / 111320,
      ]);
      const width = Math.max(1.5, 2 * Math.abs(
        (side.x - front.x) * Math.sin(physicalAngle) - (side.y - front.y) * Math.cos(physicalAngle),
      ));
      bodyWidth += blend * (width - bodyWidth);
      // 3D와 같은 차량 피치를 따라 각 차량의 양끝을 별도로 투영한다.
      const compactPitch = (carCount * CAR_PIXELS + CAB_PIXELS) / carCount;
      const cos = Math.cos(tangent);
      const sin = Math.sin(tangent);
      const point = (distance: number, offset: number) => {
        const target = project(sampler.sample(distance).coordinate);
        const x = front.x + cos * offset;
        const y = front.y + sin * offset;
        return { x: x + (target.x - x) * blend, y: y + (target.y - y) * blend };
      };
      cars = [];
      for (let i = 0; i < carCount; i++) {
        const center = frontDistanceMeters - i * SUBWAY_TRAIN_CAR_SPACING_METERS;
        cars.push({
          front: point(center + CAR_HALF_METERS, CAB_PIXELS - i * compactPitch),
          rear: point(center - CAR_HALF_METERS, CAB_PIXELS - (i + 1) * compactPitch),
        });
      }
    }
  }
  return {
    front,
    rear: { x: front.x - Math.cos(angle) * tail, y: front.y - Math.sin(angle) * tail },
    angle,
    carCount,
    bodyLength: tail + frontOverhang,
    bodyWidth,
    frontOverhang,
    cars,
  };
}

export function drawOverviewTrainIcon(
  context: CanvasRenderingContext2D,
  icon: OverviewTrainIcon,
  { color, dwelling, opacity = 1, selected = false, departureGlow = 0 }:
    { color: string; dwelling: boolean; opacity?: number; selected?: boolean; departureGlow?: number },
) {
  if (icon.cars?.length) {
    drawOverviewCars(context, icon.cars, icon.bodyWidth, color, dwelling, opacity, selected);
    return;
  }
  const tail = icon.frontOverhang - icon.bodyLength;
  const carPixels = -tail / icon.carCount;
  context.save();
  context.globalAlpha = opacity;
  context.translate(icon.front.x, icon.front.y);
  context.rotate(icon.angle);
  context.scale(1, icon.bodyWidth / BODY_WIDTH);
  context.beginPath();
  context.roundRect(tail, -BODY_WIDTH / 2, icon.bodyLength, BODY_WIDTH, 2);
  context.strokeStyle = selected ? "#ffdfa1" : "#1a2028";
  context.lineWidth = 2;
  context.stroke();
  context.fillStyle = "#e1e5eb";
  context.fill();
  context.fillStyle = color;
  context.fillRect(tail + 1.4, 0.8, Math.max(0, icon.bodyLength - 2.8), 1.6);
  context.fillStyle = dwelling ? "#ffb65f" : "#273547";
  context.beginPath();
  for (let car = 0; car < icon.carCount; car++) {
    context.rect(tail + carPixels * (car + 0.2), -2, Math.min(3, carPixels * 0.58), 1.8);
  }
  context.fill();
  if (departureGlow > 0) {
    context.globalAlpha = opacity * departureGlow;
    context.fillStyle = "#ffda8b";
    context.fillRect(0.6, -1.5, 2, 3);
  }
  context.restore();
}

function drawOverviewCars(
  context: CanvasRenderingContext2D, cars: CarSegment[], width: number,
  color: string, dwelling: boolean, opacity: number, selected: boolean,
) {
  const fill = new Path2D();
  const stripes = new Path2D();
  const windows = new Path2D();
  for (const { front, rear } of cars) {
    const length = Math.hypot(front.x - rear.x, front.y - rear.y);
    if (length < 0.2) continue;
    const cx = (front.x + rear.x) / 2;
    const cy = (front.y + rear.y) / 2;
    const angle = Math.atan2(front.y - rear.y, front.x - rear.x);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const matrix = new DOMMatrix([cos, sin, -sin, cos, cx, cy]);
    const halfLength = (length - Math.min(0.85, length * 0.12)) / 2;
    const car = new Path2D();
    car.roundRect(-halfLength, -width / 2, halfLength * 2, width, Math.min(1.4, width / 3));
    fill.addPath(car, matrix);
    const stripe = new Path2D();
    stripe.rect(-halfLength, width * 0.13, halfLength * 2, width * 0.2);
    stripes.addPath(stripe, matrix);
    const windowPath = new Path2D();
    windowPath.rect(-halfLength / 2, -width * 0.32, halfLength, width * 0.21);
    windows.addPath(windowPath, matrix);
  }
  context.save();
  context.globalAlpha = opacity;
  context.strokeStyle = selected ? "#ffdfa1" : "#1a2028";
  context.lineWidth = 0.8;
  context.stroke(fill);
  context.fillStyle = "#e1e5eb";
  context.fill(fill);
  context.fillStyle = color;
  context.fill(stripes);
  context.fillStyle = dwelling ? "#ffb65f" : "#273547";
  context.fill(windows);
  context.restore();
}
