import { LINE_1_OPERATOR_COLORS, LINE_1_SECTIONS } from "../features/subway/line-1-sections";
import "./line-1-display.css";

export function Line1SectionKey({ details = false }: { details?: boolean }) {
  return (
    <ul className="line1-key">
      <li><i style={{ background: LINE_1_OPERATOR_COLORS.metro }} />
        <span>서울교통공사 {details && <small>서울역 ~ 청량리</small>}</span></li>
      <li><i style={{ background: LINE_1_OPERATOR_COLORS.korail }} />
        <span>코레일 직결 구간</span></li>
      <li><i style={{ background: LINE_1_OPERATOR_COLORS.unknown }} />
        <span>구간 미확인</span></li>
    </ul>
  );
}

export function Line1MapLegend() {
  return (
    <details className="line1-map-legend">
      <summary><span className="line1-chip" aria-hidden="true">1</span>1호선 구간</summary>
      <Line1SectionKey details />
      <dl>
        {LINE_1_SECTIONS.filter(({ id }) => id !== "metro").map(({ id, name, from, to }) => (
          <div key={id}><dt>{name}</dt><dd>{from} ~ {to}</dd></div>
        ))}
      </dl>
    </details>
  );
}
