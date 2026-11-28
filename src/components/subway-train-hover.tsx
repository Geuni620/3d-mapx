import type { RefObject } from "react";
import type { CinemaTrainInput } from "../features/cinema/cinema-tour";
import { useTrainClockStore, useTrainTime } from "../features/night-pulse/train-clock";
import { useEffect, useState } from "react";
import { useMap } from "react-map-gl/maplibre";
import type { MapMouseEvent } from "maplibre-gl";
import { getLine1SectionLabel, getLine1TrackSection, getLine1TripPresentation } from "../features/subway/line-1-sections";
import { line2Headsign } from "../features/subway/line-2-presentation";
import { getScheduledFleet } from "../features/subway/line-2-timetable";
import {
  getActiveSubwayTrips, getScheduledSubwayTrips, getSubwayServiceSecond, getSubwayTripJourney, sampleSubwayTrip, type TimetableTrip,
} from "../features/subway/subway-timetable";
import {
  sampleOverviewTrainIcon, type CarSegment, type OverviewTrainIcon, type Pixel,
} from "../features/subway/subway-overview-icon";
import { LINE_2_MAIN_CAR_COUNT } from "../features/subway/subway-train-model";
import { focusSubwayTrain } from "../features/subway/subway-train-camera";
import { createSubwayScreenProjector } from "../features/subway/subway-screen-projection";
import { SUBWAY_LINE_COLORS, type SubwayLineNumber } from "../features/subway/subway-constants";
import "./subway-train-hover.css";

interface HoveredTrain {
  line: SubwayLineNumber;
  origin: string;
  destination: string;
  headsign: string;
  section?: string;
  line1Trip?: TimetableTrip;
  icon: OverviewTrainIcon;
  tooltip: Pixel;
  focus: () => void;
}

function iconSegments(icon: OverviewTrainIcon): CarSegment[] {
  if (icon.cars?.length) return icon.cars;
  return [{
    rear: icon.rear,
    front: {
      x: icon.front.x + Math.cos(icon.angle) * icon.frontOverhang,
      y: icon.front.y + Math.sin(icon.angle) * icon.frontOverhang,
    },
  }];
}

function distanceToIcon(point: Pixel, icon: OverviewTrainIcon) {
  let nearest = Infinity;
  for (const { front, rear } of iconSegments(icon)) {
    const dx = front.x - rear.x;
    const dy = front.y - rear.y;
    const length = dx * dx + dy * dy;
    if (length < 0.04) continue;
    const px = point.x - rear.x, py = point.y - rear.y;
    const along = Math.max(0, Math.min(1, (px * dx + py * dy) / length));
    nearest = Math.min(nearest, Math.hypot(px - along * dx, py - along * dy));
  }
  return nearest;
}

export function SubwayTrainHover({ cinemaInput, selectedLines, onLine2Focus }: {
  cinemaInput: RefObject<CinemaTrainInput>;
  selectedLines: readonly SubwayLineNumber[];
  onLine2Focus: (train: { id: string | null; clearStation?: boolean }) => void;
}) {
  const clock = useTrainClockStore();
  const { current: mapRef } = useMap();
  const [selectedTrip, setSelectedTrip] = useState<TimetableTrip | null>(null);
  const [hover, setHover] = useState<HoveredTrain | null>(null);

  useEffect(() => {
    const map = mapRef?.getMap();
    if (!map) return;
    const canvas = map.getCanvas();
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let pointer: Pixel | undefined;
    let frame = 0;
    let lastSecond = -1;
    let otherTrips: ReturnType<typeof getActiveSubwayTrips> = [];
    let line2Trains: ReturnType<typeof getScheduledFleet> = [];
    const project = createSubwayScreenProjector(map);

    const pick = (pointer: Pixel): HoveredTrain | null => {
      const timestamp = clock.now();
      const second = Math.floor(timestamp / 1000);
      if (lastSecond !== second) {
        lastSecond = second;
        otherTrips = getActiveSubwayTrips(timestamp, selectedLines);
        line2Trains = selectedLines.includes(2) ? getScheduledFleet(timestamp) : [];
      }
      const zoom = map.getZoom();
      const viewport = { width: canvas.clientWidth, height: canvas.clientHeight };
      const tooltip = {
        x: Math.max(8, Math.min(pointer.x + 14, viewport.width - 232)),
        y: pointer.y + 110 < viewport.height ? pointer.y + 14 : Math.max(8, pointer.y - 104),
      };
      let closest: HoveredTrain | null = null;
      let closestDistance = Infinity;
      const consider = (
        icon: OverviewTrainIcon | undefined, line: SubwayLineNumber,
        journey: () => Pick<HoveredTrain, "origin" | "destination" | "headsign" | "section" | "line1Trip" | "focus">,
      ) => {
        if (!icon || !pointer) return;
        const distance = distanceToIcon(pointer, icon);
        // 가까운 선로에 여러 열차가 겹쳐도 중심선에서 가장 가까운 편성을 고른다.
        if (distance > Math.max(8, icon.bodyWidth / 2 + 3) || distance >= closestDistance) return;
        closest = { ...journey(), line, icon, tooltip };
        closestDistance = distance;
      };
      const seconds = getSubwayServiceSecond(timestamp);
      for (const trip of otherTrips) {
        const pose = sampleSubwayTrip(trip, seconds);
        if (!pose) continue;
        const icon = sampleOverviewTrainIcon(pose.sampler, pose.frontDistanceMeters, pose.carCount, project, viewport, zoom, pose.front);
        consider(icon, pose.line, () => {
          const journey = getSubwayTripJourney(trip);
          const presentation = trip[0] === 1 ? {
            ...getLine1TripPresentation(trip),
            section: getLine1SectionLabel(getLine1TrackSection(pose.path, pose.frontDistanceMeters)),
            line1Trip: trip,
          } : { ...journey, headsign: `${journey.destination}행` };
          return {
            ...presentation,
            focus: () => {
              onLine2Focus({ id: null, clearStation: trip[0] === 1 });
              focusSubwayTrain(
                map, pose.carCount, offset => sampleSubwayTrip(trip, getSubwayServiceSecond(clock.forecast(offset))) ?? pose,
                !reduced.matches,
              );
            },
          };
        });
      }
      for (const train of line2Trains) {
        const motion = train.getMotion(timestamp);
        const icon = sampleOverviewTrainIcon(train.sampler, motion.frontDistanceMeters, LINE_2_MAIN_CAR_COUNT, project, viewport, zoom);
        consider(icon, 2, () => ({
          origin: train.origin,
          destination: train.destination,
          headsign: line2Headsign(train),
          focus: () => {
            onLine2Focus({ id: train.id });
            focusSubwayTrain(map, LINE_2_MAIN_CAR_COUNT, offset => ({
              sampler: train.sampler,
              frontDistanceMeters: train.getMotion(clock.forecast(offset)).frontDistanceMeters,
            }), !reduced.matches);
          },
        }));
      }
      return closest;
    };
    const update = () => {
      if (!pointer || map.isMoving()) return;
      const closest = pick(pointer);
      canvas.style.cursor = closest ? "pointer" : "";
      setHover(closest);
      return closest;
    };
    const move = (event: MapMouseEvent) => {
      pointer = event.point;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    };
    const leave = () => { pointer = undefined; canvas.style.cursor = ""; setHover(null); };
    const cameraMove = () => { canvas.style.cursor = ""; setHover(null); };
    const click = (event: MapMouseEvent) => {
      if (event.defaultPrevented) { setSelectedTrip(null); return; }
      pointer = event.point;
      const train = update();
      setSelectedTrip(train?.line1Trip ?? null);
      if (train) {
        event.preventDefault();
        cinemaInput.current.restoreBeforeFocus?.();
        train.focus();
      } else {
        if (map.isEasing()) map.stop();
        onLine2Focus({ id: null });
      }
    };

    const input = cinemaInput.current;
    input.hasTrainAt = point => Boolean(pick(point));
    map.on("mousemove", move);
    map.on("mouseout", leave);
    map.on("click", click);
    map.on("movestart", cameraMove);
    map.on("moveend", update);
    const timer = window.setInterval(update, 120);
    return () => {
      delete input.hasTrainAt;
      cancelAnimationFrame(frame);
      window.clearInterval(timer);
      map.off("mousemove", move);
      map.off("mouseout", leave);
      map.off("click", click);
      map.off("movestart", cameraMove);
      map.off("moveend", update);
      leave();
    };
  }, [mapRef, onLine2Focus, selectedLines, clock, cinemaInput]);

  const card = selectedTrip && selectedLines.includes(1) &&
    <Line1TrainCard trip={selectedTrip} onClose={() => setSelectedTrip(null)} />;
  if (!hover) return card;
  const { icon, tooltip, line, origin, destination, headsign, section } = hover;
  const height = Math.max(14, icon.bodyWidth + 8);
  return <>
    {card}
    {iconSegments(icon).map(({ front, rear }, index) => {
      const length = Math.hypot(front.x - rear.x, front.y - rear.y);
      if (length < 0.2) return null;
      const angle = Math.atan2(front.y - rear.y, front.x - rear.x);
      return <div key={index} className="subway-train-hover-area" aria-hidden="true" style={{
        left: rear.x, top: rear.y, width: length + 6, height,
        transform: `rotate(${angle}rad) translate(-3px, ${-height / 2}px)`,
      }} />;
    })}
    <div className="subway-train-hover-tooltip" role="tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
      <div><span className="subway-train-hover-line" style={{ backgroundColor: SUBWAY_LINE_COLORS[line] }}>{line}호선</span>
        <strong>{headsign}</strong></div>
      <span>{origin} → {destination} · {icon.carCount}량</span>
      {section && <span className="line1-tooltip-section">{section}</span>}
    </div>
  </>;
}

function Line1TrainCard({ trip, onClose }: { trip: TimetableTrip; onClose: () => void }) {
  const { time } = useTrainTime();
  const pose = getScheduledSubwayTrips(time).includes(trip)
    ? sampleSubwayTrip(trip, getSubwayServiceSecond(time))
    : undefined;
  const { headsign, origin, destination } = getLine1TripPresentation(trip);
  return <section className="line1-card" aria-label="1호선 열차 정보">
    <header className="line1-card-header">
      <span className="line1-chip" aria-hidden="true">1</span>
      <div><h2>{headsign}</h2><p>{origin} → {destination} · {trip[4]}량</p></div>
      <button type="button" aria-label="열차 정보 닫기" onClick={onClose}>×</button>
    </header>
    <p className="line1-train-detail">{pose
      ? getLine1SectionLabel(getLine1TrackSection(pose.path, pose.frontDistanceMeters))
      : "이 시각에는 운행하지 않습니다."}</p>
  </section>;
}
