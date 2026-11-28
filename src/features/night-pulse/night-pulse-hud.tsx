import { formatSeoulClock, useTrainTime } from "./train-clock";
import "./night-pulse-hud.css";

export function NightPulseHud() {
  const { time, mode, playing } = useTrainTime();
  const clock = formatSeoulClock(time);
  return (
    <section className="night-pulse-hud" aria-label="야간 맥박 기준 시각">
      <time className="night-pulse-clock" dateTime={clock}>{clock} <abbr title="한국 표준시">KST</abbr></time>
      {mode === "replay" && <span>{playing ? "재생 중" : "일시정지"}</span>}
    </section>
  );
}
