import { useEffect, useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  getCornerHeadingComparison,
  mountContinuousTrainScene,
  mountCornerComparisonScene,
  TRAIN_SIMULATION_HEADWAY_SECONDS,
  type CornerComparisonScene,
  type TrainHeadingCalculation,
} from "./subway-train-heading-story-scene";
import "./subway-train-heading-comparison.css";

const meta = {
  title: "Subway/Train heading comparison",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const BeforeAndAfter: Story = {
  render: () => <BeforeAfterStory />,
};

export const ContinuousSimulation: Story = {
  render: () => <ContinuousSimulationStory />,
};

function BeforeAfterStory() {
  const canvasReference = useRef<HTMLCanvasElement>(null);
  const sceneReference = useRef<CornerComparisonScene | undefined>(undefined);
  const [offsetMeters, setOffsetMeters] = useState(0);
  const headings = getCornerHeadingComparison(offsetMeters);

  useEffect(() => {
    const canvas = canvasReference.current;

    if (canvas === null) {
      return;
    }

    const scene = mountCornerComparisonScene(canvas);

    sceneReference.current = scene;
    scene.setOffsetMeters(offsetMeters);
    return () => scene.dispose();
  }, []);

  useEffect(() => {
    sceneReference.current?.setOffsetMeters(offsetMeters);
  }, [offsetMeters]);

  return (
    <main className="heading-story">
      <StoryHeader
        eyebrow="CURVE INSPECTION"
        title="실제 열차 모형 방향 비교"
        description="같은 위치의 두 편성에서 회전 계산 방식만 비교합니다."
        status={`${getAngleDifference(headings).toFixed(1)}° 차이`}
      />

      <section className="heading-story__stage">
        <div className="heading-story__legend">
          <StoryBadge calculation="segment" label="BEFORE · 구간 방향" />
          <StoryBadge calculation="bogie-chord" label="AFTER · 대차 방향" />
        </div>
        <canvas ref={canvasReference} aria-label="열차 방향 계산 전후 비교" />
      </section>

      <section className="heading-story__readout">
        <HeadingValue
          calculation="segment"
          label="BEFORE"
          value={headings.beforeDegrees}
        />
        <HeadingValue
          calculation="bogie-chord"
          label="AFTER"
          value={headings.afterDegrees}
        />
      </section>

      <section className="heading-story__controls">
        <label htmlFor="corner-offset">
          모서리 기준 위치
          <strong>{formatDistance(offsetMeters)}</strong>
        </label>
        <input
          id="corner-offset"
          type="range"
          min="-12"
          max="12"
          step="0.1"
          value={offsetMeters}
          onChange={(event) =>
            setOffsetMeters(Number(event.currentTarget.value))
          }
        />
        <div>
          {[
            { label: "진입", value: -8 },
            { label: "차이 최대", value: 0 },
            { label: "이탈", value: 8 },
          ].map((preset) => (
            <button
              key={preset.label}
              type="button"
              data-active={offsetMeters === preset.value}
              onClick={() => setOffsetMeters(preset.value)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}

function ContinuousSimulationStory() {
  return (
    <main className="heading-story">
      <StoryHeader
        eyebrow="LIVE LOOP"
        title="연속 주행 비교"
        description="동일한 3량 편성을 같은 경로와 속도로 계속 운행합니다."
        status={`${TRAIN_SIMULATION_HEADWAY_SECONDS.toFixed(1)}초 배차`}
      />

      <section className="heading-story__simulations">
        <SimulationPanel
          calculation="segment"
          label="BEFORE"
          title="구간 방향"
        />
        <SimulationPanel
          calculation="bogie-chord"
          label="AFTER"
          title="대차 chord 방향"
        />
      </section>

      <p className="heading-story__conditions">
        <strong>동일 조건</strong>
        3량 편성 · 4개 열차 · 14m/s · 동일 경로 · 동일 카메라
      </p>
    </main>
  );
}

function SimulationPanel({
  calculation,
  label,
  title,
}: {
  calculation: TrainHeadingCalculation;
  label: string;
  title: string;
}) {
  const canvasReference = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasReference.current;

    if (canvas === null) {
      return;
    }

    return mountContinuousTrainScene(canvas, calculation);
  }, [calculation]);

  return (
    <article className="heading-story__simulation" data-mode={calculation}>
      <header>
        <span>{label}</span>
        <h2>{title}</h2>
      </header>
      <canvas ref={canvasReference} aria-label={`${label} 열차 연속 주행`} />
    </article>
  );
}

function StoryHeader({
  eyebrow,
  title,
  description,
  status,
}: {
  eyebrow: string;
  title: string;
  description: string;
  status: string;
}) {
  return (
    <header className="heading-story__header">
      <div>
        <p>{eyebrow}</p>
        <h1>{title}</h1>
        <span>{description}</span>
      </div>
      <strong>{status}</strong>
    </header>
  );
}

function StoryBadge({
  calculation,
  label,
}: {
  calculation: TrainHeadingCalculation;
  label: string;
}) {
  return <span data-mode={calculation}>{label}</span>;
}

function HeadingValue({
  calculation,
  label,
  value,
}: {
  calculation: TrainHeadingCalculation;
  label: string;
  value: number;
}) {
  return (
    <div data-mode={calculation}>
      <span>{label}</span>
      <strong>{value.toFixed(1)}°</strong>
    </div>
  );
}

function getAngleDifference(headings: {
  beforeDegrees: number;
  afterDegrees: number;
}) {
  const difference = headings.beforeDegrees - headings.afterDegrees;

  return Math.abs(
    (Math.atan2(
      Math.sin((difference * Math.PI) / 180),
      Math.cos((difference * Math.PI) / 180),
    ) *
      180) /
      Math.PI,
  );
}

function formatDistance(distanceMeters: number) {
  const prefix = distanceMeters > 0 ? "+" : "";

  return `${prefix}${distanceMeters.toFixed(1)}m`;
}
