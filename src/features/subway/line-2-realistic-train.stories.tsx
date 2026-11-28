import { useEffect, useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  mountLine2ModelStory,
  STATION_SAMPLE,
  type StationPlaybackStatus,
  type TrainView,
} from "./line-2-model-story-scene";
import "./line-2-realistic-train.stories.css";

export default {
  title: "Subway/2호선 실사 열차",
  id: "subway-line-2-realistic",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

function ModelViewer({ initialView }: { initialView: TrainView }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<ReturnType<typeof mountLine2ModelStory> | null>(null);
  const [view, setView] = useState(initialView);
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    if (!canvas.current) return;
    const scene = mountLine2ModelStory(canvas.current, initialView);
    stage.current = scene;
    setPlaying(scene.playing);
    return () => {
      scene.dispose();
      stage.current = null;
    };
  }, [initialView]);
  function select(next: TrainView) {
    stage.current?.setView(next);
    setView(next);
  }
  return (
    <main className="line2-model">
      <canvas ref={canvas} aria-label="선로 위를 움직이는 2호선 4차분 열차" />
      <header>
        <span>서울교통공사 · 본선 외선</span>
        <h1>2호선 4차분</h1>
      </header>
      <nav aria-label="열차 모델 보기">
        <button aria-pressed={view === "closeup"} onClick={() => select("closeup")}>
          선두차 근접
        </button>
        <button aria-pressed={view === "curve"} onClick={() => select("curve")}>
          곡선 전경
        </button>
        <button
          onClick={() => {
            stage.current?.setPlaying(!playing);
            setPlaying(!playing);
          }}
        >
          {playing ? "일시정지" : "재생"}
        </button>
      </nav>
      <footer>
        <span>문래 → 신도림 · 드래그 회전 / 스크롤 확대</span>
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          선형 © OpenStreetMap
        </a>
      </footer>
    </main>
  );
}
export const Closeup: StoryObj = {
  name: "선두차 근접",
  render: () => <ModelViewer initialView="closeup" />,
};
export const Curve: StoryObj = {
  name: "곡선 전경",
  render: () => <ModelViewer initialView="curve" />,
};

const seoulClock = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour12: false,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function StationViewer() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewer = useRef<ReturnType<typeof mountLine2ModelStory> | null>(null);
  const [status, setStatus] = useState<StationPlaybackStatus | null>(null);
  useEffect(() => {
    if (!canvas.current) return;
    const scene = mountLine2ModelStory(canvas.current, "station", setStatus);
    viewer.current = scene;
    return () => {
      scene.dispose();
      viewer.current = null;
    };
  }, []);
  const end = status && status.elapsed === status.duration;
  return (
    <main className="line2-model">
      <canvas
        ref={canvas}
        aria-label="왕십리 승강장에서 본 2004 내선 열차의 정차, 오른쪽 출입문과 출발"
      />
      <header>
        <span>내선 {STATION_SAMPLE.trainNumber} · 평일 시간표 재생</span>
        <h1>{STATION_SAMPLE.station} 정차와 출발</h1>
        {status && (
          <p className="line2-model__station-clock">
            {seoulClock.format(status.timestamp)} · {Math.round(status.speed)} km/h
          </p>
        )}
      </header>
      <nav aria-label="정차 장면 재생" className="line2-model__station-controls">
        <button onClick={() => viewer.current?.setPlaying(!status?.playing)}>
          {status?.playing ? "일시정지" : end ? "다시 재생" : "재생"}
        </button>
        <input
          type="range"
          aria-label="정차 장면 시각"
          aria-valuetext={(status && seoulClock.format(status.timestamp)) || undefined}
          min="0"
          max={status?.duration ?? 1}
          step="100"
          value={status?.elapsed ?? 0}
          onChange={(e) => viewer.current?.seek(e.currentTarget.valueAsNumber)}
        />
      </nav>
      <footer>
        <span>공식 시각표 · 문 개폐 시간은 연출값</span>
        <a href="https://www.data.go.kr/data/15098251/fileData.do" target="_blank" rel="noreferrer">
          시각표 서울교통공사
        </a>
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          선형 © OpenStreetMap
        </a>
      </footer>
    </main>
  );
}
export const StationStop: StoryObj = { name: "정차와 출발", render: () => <StationViewer /> };
