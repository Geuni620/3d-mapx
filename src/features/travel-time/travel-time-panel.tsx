import { useEffect, useRef, useState, type CSSProperties } from "react";
import { BASE_GRAPH, FUTURE_LINES, type FutureLine } from "./travel-time-data";
import {
  TRAVEL_PRESETS,
  deltaText,
  endpointLabel,
  futureServicesUsed,
  minutesText,
  platformName,
} from "./travel-time-format";
import { TIME_BANDS, type TimeBand, type TransferRule, type TravelNetwork } from "./travel-network";
import { BREAKDOWN_KEYS, BREAKDOWN_LABELS, type BreakdownKey, type TravelEndpoint, type TravelRoute } from "./travel-route";
import {
  FUTURE_SERVICE,
  FUTURE_SERVICE_OVERRIDES,
  TRAVEL_PARAMETERS,
  WALK_SENSITIVITY,
  type ParameterStatus,
  type TravelParameter,
} from "./travel-time-parameters";
import { describeOpening, isLineOpen, TRAVEL_YEARS, type TravelYear } from "./travel-years";


export interface YearResult {
  year: TravelYear;
  network: TravelNetwork;
  route: TravelRoute | null;
  failure: string | null;
}

const BREAKDOWN_TONES: Record<BreakdownKey, string> = {
  walkAccess: "walk",
  entry: "gate",
  wait: "wait",
  ride: "ride",
  transferWalk: "transfer",
  transferWait: "transfer-wait",
  exit: "gate",
  walkEgress: "walk",
};

const TRANSFER_RULE_LABELS: Record<TransferRule, string> = {
  csv: "서울교통공사 환승거리",
  "csv-reverse": "서울교통공사 환승거리(반대 방향 값)",
  "same-csv": "같은 역 계통 변경 · 서울교통공사 환승거리",
  same: "같은 역 계통 변경 · 보행 가정 0",
  future: "장래 환승 가정값",
  fallback: "환승 가정값(코레일 구간 등 거리 미확보)",
};

const LIMIT_NOTE = "2026 기준망은 1~8호선뿐입니다. 경춘선·경의중앙선·9호선·신분당선·수인분당선·GTX-A 운행 구간 등이 빠져 있어, 그 노선이 유리한 구간은 2026 시간이 길게 나옵니다.";

function StatusBadge({ status }: { status: ParameterStatus | "보도 기준" | "개통연도 미정" | "목표" }) {
  return <span className="travel-badge" data-status={status}>{status}</span>;
}

function AnimatedMinutes({ seconds }: { seconds: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(seconds);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const from = shown.current;
    const to = seconds;
    shown.current = to;
    if (from === to || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      element.textContent = minutesText(to);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 240);
      const eased = 1 - (1 - t) ** 3;
      element.textContent = String(Math.round((from + (to - from) * eased) / 60));
      if (t < 1) frame = requestAnimationFrame(tick);
      else element.textContent = minutesText(to);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [seconds]);
  return <span ref={ref}>{minutesText(seconds)}</span>;
}

function ParameterRow({ parameter }: { parameter: TravelParameter }) {
  return (
    <li>
      <div className="travel-basis-head">
        <span>{parameter.label}</span>
        <b>{parameter.value}{parameter.unit === "초" || parameter.unit === "분" ? "" : " "}{parameter.unit}</b>
        <StatusBadge status={parameter.status} />
      </div>
      {(parameter.sourceLabel || parameter.note) && (
        <p>
          {parameter.sourceUrl ? <a href={parameter.sourceUrl} target="_blank" rel="noreferrer">{parameter.sourceLabel}</a> : parameter.sourceLabel}
          {parameter.sourceLabel && parameter.note ? " · " : ""}{parameter.note}
        </p>
      )}
    </li>
  );
}

function YearSegments({ year, onYear, results }: {
  year: TravelYear;
  onYear: (year: TravelYear) => void;
  results?: YearResult[];
}) {
  return (
    <div className="travel-year-segments" role="radiogroup" aria-label="계산 연도">
      {TRAVEL_YEARS.map(value => {
        const result = results?.find(item => item.year === value);
        return (
          <button key={value} type="button" role="radio" aria-checked={year === value} onClick={() => onYear(value)}>
            <span>{value}</span>
            {result?.route && <small>{minutesText(result.route.totalSeconds)}분</small>}
          </button>
        );
      })}
    </div>
  );
}

function LegList({ route, network }: { route: TravelRoute; network: TravelNetwork }) {
  return (
    <ol className="travel-legs">
      {route.legs.map((leg, index) => {
        if (leg.kind === "walk") return (
          <li key={index} className="travel-leg" data-kind="walk">
            <span className="travel-leg-chip" aria-hidden="true">도보</span>
            <div>
              <b>{leg.role === "access" ? `${leg.name}역까지` : leg.role === "egress" ? `${leg.name}역에서` : "목적지까지 걷기"}</b>
              <small>직선 {Math.round(leg.meters)}m × 우회 {TRAVEL_PARAMETERS.walkDetour.value}</small>
            </div>
            <span className="travel-leg-time">{minutesText(leg.seconds)}분</span>
          </li>
        );
        if (leg.kind === "transfer") return (
          <li key={index} className="travel-leg" data-kind="transfer">
            <span className="travel-leg-chip" aria-hidden="true">환승</span>
            <div>
              <b>{leg.at} 환승</b>
              <small>{TRANSFER_RULE_LABELS[leg.rule]}</small>
            </div>
            <span className="travel-leg-time">{minutesText(leg.seconds)}분</span>
          </li>
        );
        const service = network.services.get(leg.service)!;
        return (
          <li key={index} className="travel-leg" data-kind="ride" style={{ "--leg-color": service.color } as CSSProperties}>
            <span className="travel-leg-chip" aria-hidden="true">{service.future ? service.label : service.id}</span>
            <div>
              <b>{platformName(network, leg.fromPlatform)} → {platformName(network, leg.toPlatform)}</b>
              <small>
                {service.label} · {leg.stops}구간 · 대기 {minutesText(leg.waitSeconds)}분
                {service.future && " · 장래선"}
                {leg.approxMeters > 0 && ` · 개략선형 ${(leg.approxMeters / 1000).toFixed(1)}km`}
              </small>
            </div>
            <span className="travel-leg-time">{minutesText(leg.seconds)}분</span>
          </li>
        );
      })}
    </ol>
  );
}

function FutureLineBasis({ line, open }: { line: FutureLine; open: boolean }) {
  const opening = describeOpening(line);
  return (
    <li className="travel-basis-line" style={{ "--leg-color": line.color } as CSSProperties}>
      <div className="travel-basis-head">
        <span className="travel-line-dot" aria-hidden="true" />
        <span>{line.name}</span>
        <StatusBadge status={opening.badge} />
      </div>
      <p>
        {line.stage} · {line.approval.kind}{line.approval.notice ? ` ${line.approval.notice}` : ""}{line.approval.date ? ` (${line.approval.date})` : ""}
        {line.approval.note ? ` — ${line.approval.note}` : ""}
      </p>
      <p>{opening.label} · {line.opening.kind}{open ? "" : " · 이 연도 미반영"}</p>
      {!line.routing.enabled && <p>경로 계산 제외: {line.routing.reason}</p>}
      {line.routing.enabled && line.routing.excluded.length > 0 && (
        <p>계산 제외 역: {line.routing.excluded.map(item => `${item.station.split(":").at(-1)}(${item.reason})`).join(", ")}</p>
      )}
      {line.conflicts.length > 0 && <p className="travel-basis-conflict">자료 충돌: {line.conflicts.join(" / ")}</p>}
      <p className="travel-basis-sources">
        {line.sources.map(source => (
          <a key={source.url + source.title} href={source.url} target="_blank" rel="noreferrer">
            {source.org} {source.date}<small>{source.tier}</small>
          </a>
        ))}
      </p>
    </li>
  );
}

export function TravelTimePanel({
  results, year, onYear, band, onBand, origin, destination, onPreset, onSwap, onReset, onClose, picking,
}: {
  results: YearResult[];
  year: TravelYear;
  onYear: (year: TravelYear) => void;
  band: TimeBand;
  onBand: (band: TimeBand) => void;
  origin: TravelEndpoint | null;
  destination: TravelEndpoint | null;
  onPreset: (origin: string, destination: string) => void;
  onSwap: () => void;
  onReset: () => void;
  onClose: () => void;
  picking: "origin" | "destination" | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const current = results.find(item => item.year === year)!;
  const baseline = results[0];
  const labelNetwork = results.at(-1)!.network;
  const { route, network } = current;
  const total = route?.totalSeconds ?? 0;
  const usedFuture = futureServicesUsed(route, network);
  const openLines = FUTURE_LINES.lines.filter(line => isLineOpen(line, year));
  const parameters = Object.values(TRAVEL_PARAMETERS) as TravelParameter[];
  const futureParameters: TravelParameter[] = [
    FUTURE_SERVICE.gtx.speed,
    FUTURE_SERVICE.gtx.headway as TravelParameter,
    network.assumptions.metroSpeed,
    network.assumptions.metroHeadway,
    ...Object.values(FUTURE_SERVICE_OVERRIDES).flatMap(override => override.speed ? [override.speed] : []),
  ];

  return (
    <section className="travel-panel" data-expanded={expanded ? "" : undefined} aria-label="연도별 지하철 소요시간 예측">
      <header className="travel-panel-header">
        <div className="travel-panel-title">
          <h2>소요시간 예측</h2>
          <label className="travel-band">
            <span className="sr-only">출발 시간대</span>
            <select value={band.id} onChange={event => onBand(TIME_BANDS.find(item => item.id === event.target.value)!)}>
              {TIME_BANDS.map(item => <option key={item.id} value={item.id}>{item.label} 출발</option>)}
            </select>
          </label>
        </div>
        <button type="button" className="travel-icon-button travel-expand" aria-expanded={expanded}
          aria-label={expanded ? "패널 접기" : "패널 펼치기"} onClick={() => setExpanded(!expanded)}>
          <span aria-hidden="true">{expanded ? "▾" : "▴"}</span>
        </button>
        <button type="button" className="travel-icon-button" aria-label="소요시간 모드 닫기" onClick={onClose}>×</button>
      </header>

      <div className="travel-summary">
        <div className="travel-od" data-picking={picking ?? undefined}>
          <p data-role="origin"><span aria-hidden="true" />
            <b>{endpointLabel(origin, labelNetwork) ?? "지도에서 출발지를 누르세요"}</b></p>
          <p data-role="destination"><span aria-hidden="true" />
            <b>{endpointLabel(destination, labelNetwork) ?? (origin ? "도착지를 누르세요" : "도착")}</b></p>
          <div className="travel-od-actions">
            <button type="button" onClick={onSwap} disabled={!origin || !destination} aria-label="출발·도착 바꾸기">⇅</button>
            <button type="button" onClick={onReset} disabled={!origin}>출발 다시 고르기</button>
          </div>
        </div>
        {route ? (
          <div className="travel-total" aria-live="polite">
            <strong><AnimatedMinutes seconds={total} /><span>분</span></strong>
            <div>
              <b>{year}{year === 2026 ? " 현재" : ""}</b>
              <small>{year === 2026 ? "기준망" : `2026 대비 ${baseline.route ? deltaText(total - baseline.route.totalSeconds) : "비교 불가"}`}</small>
            </div>
          </div>
        ) : origin && destination ? (
          <p className="travel-empty" role="status">{current.failure ?? "이 연도 계산망에서 경로를 찾지 못했습니다"}</p>
        ) : null}
        <YearSegments year={year} onYear={onYear} results={results} />
      </div>

      <div className="travel-panel-body">
        <div className="travel-presets" aria-label="예시 구간">
          {TRAVEL_PRESETS.map(preset => (
            <button key={preset.id} type="button"
              aria-pressed={origin?.kind === "station" && destination?.kind === "station" && origin.complex === preset.origin && destination.complex === preset.destination}
              onClick={() => onPreset(preset.origin, preset.destination)}>{preset.label}</button>
          ))}
        </div>

        {route && <>
          <div className="travel-bar" role="img" aria-label={BREAKDOWN_KEYS.filter(key => route.breakdown[key] > 0)
            .map(key => `${BREAKDOWN_LABELS[key]} ${minutesText(route.breakdown[key])}분`).join(", ")}>
            {BREAKDOWN_KEYS.filter(key => route.breakdown[key] > 0).map(key => (
              <span key={key} data-tone={BREAKDOWN_TONES[key]} style={{ flexGrow: route.breakdown[key] }} title={`${BREAKDOWN_LABELS[key]} ${minutesText(route.breakdown[key])}분`} />
            ))}
          </div>
          <ul className="travel-bar-legend">
            {BREAKDOWN_KEYS.filter(key => route.breakdown[key] > 0).map(key => (
              <li key={key} data-tone={BREAKDOWN_TONES[key]}>
                <span aria-hidden="true" />{BREAKDOWN_LABELS[key]}<b>{minutesText(route.breakdown[key])}</b>
              </li>
            ))}
          </ul>
          <LegList route={route} network={network} />
        </>}

        {origin && destination && (
          <table className="travel-compare">
            <caption>같은 구간 연도 비교</caption>
            <thead><tr><th scope="col">연도</th><th scope="col">소요</th><th scope="col">2026 대비</th><th scope="col">새로 쓰는 노선</th></tr></thead>
            <tbody>
              {results.map(item => {
                const used = futureServicesUsed(item.route, item.network);
                return (
                  <tr key={item.year} aria-selected={item.year === year} onClick={() => onYear(item.year)}>
                    <th scope="row">{item.year}</th>
                    <td>{item.route ? `${minutesText(item.route.totalSeconds)}분` : "–"}</td>
                    <td>{item.route && baseline.route ? (item.year === 2026 ? "기준" : deltaText(item.route.totalSeconds - baseline.route.totalSeconds)) : "–"}</td>
                    <td>{used.length ? used.map(id => item.network.services.get(id)!.label).join(", ") : "–"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div className="travel-included">
          <h3>계산에 포함된 노선 <small>{year}</small></h3>
          <ul>
            {[1, 2, 3, 4, 5, 6, 7, 8].map(line => {
              const service = network.services.get(String(line))!;
              return <li key={line} style={{ "--leg-color": service.color } as CSSProperties}>{service.label}</li>;
            })}
            {openLines.map(line => (
              <li key={line.id} style={{ "--leg-color": line.color } as CSSProperties}
                data-future="" data-unrouted={line.routing.enabled ? undefined : ""}
                data-used={usedFuture.includes(line.id) ? "" : undefined}
                title={line.routing.enabled ? describeOpening(line).label : `지도 표시만 — ${line.routing.reason}`}>
                {line.shortName}{line.routing.enabled ? "" : " (표시만)"}
              </li>
            ))}
          </ul>
          <p className="travel-limit">{LIMIT_NOTE}</p>
        </div>

        <details className="travel-basis">
          <summary>계산 근거</summary>
          <p className="travel-formula">T = 보행접근 + 진입 + 대기 + Σ차내 + Σ(환승보행 + 환승대기) + 진출 + 보행이탈</p>
          <p>
            경로는 연도별 그래프(역·승강장·구간)에서 총 시간이 가장 짧은 것을 고릅니다. 기존선 차내시간은
            서울교통공사 운행시각표({BASE_GRAPH.edition}) 역간 시간의 중앙값, 대기는 선택한 시간대 배차간격의 절반입니다.
            장래선 차내시간은 선형 길이 ÷ 표정속도입니다.
          </p>
          <ul className="travel-basis-list">
            {parameters.map(parameter => <ParameterRow key={parameter.label} parameter={parameter} />)}
          </ul>
          <h4>장래선 운행 가정 <small>{band.label}</small></h4>
          <ul className="travel-basis-list">
            {futureParameters.map(parameter => <ParameterRow key={parameter.label} parameter={parameter} />)}
          </ul>
          <h4>보행속도 민감도 (참고)</h4>
          <ul className="travel-basis-list">
            {WALK_SENSITIVITY.map(item => (
              <li key={item.value}><div className="travel-basis-head"><span>{item.sourceLabel}</span><b>{item.value} m/s</b><StatusBadge status={item.status} /></div></li>
            ))}
          </ul>
          <h4>장래 노선 반영 기준</h4>
          <p>
            실시계획(철도)·사업계획(도시철도) 승인·고시 이후 단계인 <b>착공</b> 사업만 반영합니다. 2030은 개통 목표·보도 연도가
            2030 이하인 노선, 2040은 반영 대상 전부입니다. 기본계획·예타 단계는 계산하지 않고 "조건부 시나리오(참고)"로만 지도에 표시합니다.
          </p>
          <ul className="travel-basis-list">
            {FUTURE_LINES.lines.filter(line => line.included).map(line => (
              <FutureLineBasis key={line.id} line={line} open={isLineOpen(line, year)} />
            ))}
          </ul>
          <h4>위치 미확정</h4>
          <p>{FUTURE_LINES.pending.noCoordinates.join(", ")} — 좌표를 확보하지 못해 지도와 계산에서 뺐습니다.</p>
          <h4>자료</h4>
          <p>
            <a href={BASE_GRAPH.source} target="_blank" rel="noreferrer">서울교통공사 운행시각표 {BASE_GRAPH.edition}</a> ·
            {" "}노선·역 좌표 © OpenStreetMap contributors (ODbL) · 장래 노선 조사 자료 {FUTURE_LINES.sourceGenerated} (선형은 OSM 매핑·개략, 공식 선형 아님)
          </p>
        </details>
      </div>
    </section>
  );
}

export function TravelYearDock({ year, onYear, showReference, onShowReference }: {
  year: TravelYear;
  onYear: (year: TravelYear) => void;
  showReference: boolean;
  onShowReference: (show: boolean) => void;
}) {
  const openLines = FUTURE_LINES.lines.filter(line => isLineOpen(line, year));
  const index = TRAVEL_YEARS.indexOf(year);
  return (
    <div className="travel-year-dock">
      <div className="travel-year-track" style={{ "--year-progress": `${(index / (TRAVEL_YEARS.length - 1)) * 100}%` } as CSSProperties}>
        <YearSegments year={year} onYear={onYear} />
      </div>
      <div className="travel-year-lines">
        {openLines.length ? openLines.map(line => {
          const opening = describeOpening(line);
          return (
            <span key={line.id} style={{ "--leg-color": line.color } as CSSProperties} title={`${opening.label} · ${line.opening.kind}`}>
              {line.shortName}<small data-badge={opening.badge}>{opening.badge === "목표" ? line.opening.year : opening.badge === "보도 기준" ? `보도 ${line.opening.reportedYear}` : "미정"}</small>
            </span>
          );
        }) : <span className="travel-year-none">현재 운행 1~8호선 기준</span>}
      </div>
      <label className="travel-reference-toggle">
        <input type="checkbox" checked={showReference} onChange={event => onShowReference(event.target.checked)} />
        조건부 시나리오(참고)
      </label>
    </div>
  );
}
