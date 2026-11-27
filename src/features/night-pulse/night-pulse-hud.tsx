import { useEffect, useState } from "react";
import { formatSeoulClock, useTrainClock } from "./train-clock";
import "./night-pulse-hud.css";

export function NightPulseHud({ replay }: { replay: string | null }) {
  const now = useTrainClock();
  const [clock, setClock] = useState(() => formatSeoulClock(now()));

  useEffect(() => {
    const update = () => setClock(formatSeoulClock(now()));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [now]);

  return (
    <section className="night-pulse-hud" aria-label="야간 맥박 기준 시각">
      <time className="night-pulse-clock" dateTime={clock}>{clock} <abbr title="한국 표준시">KST</abbr></time>
      {replay !== null && <span>재생 중</span>}
    </section>
  );
}
