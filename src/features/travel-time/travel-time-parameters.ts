// 소요시간 계산에 쓰는 모든 상수는 여기 한 곳에 둔다. 근거 패널이 이 목록을 그대로 읽는다.
// status 기준: "출처" = 1차 자료에서 값 확인, "문헌 가정" = 논문·지침이 분석 가정으로 쓴 값,
// "가정값" = 이 프로젝트가 정한 값(출처 미확인). 가정값은 UI에서 반드시 배지로 드러낸다.

export type ParameterStatus = "출처" | "문헌 가정" | "가정값";

export interface TravelParameter {
  label: string;
  value: number;
  unit: string;
  status: ParameterStatus;
  sourceLabel?: string;
  sourceUrl?: string;
  note?: string;
}

// 출처 확인일은 모두 2026-11-28(KST)이다.
const SEOUL_METRO_TRANSFER = {
  sourceLabel: "서울교통공사 환승역거리 소요시간 정보 (data.go.kr 15044419, 데이터 기준일 2026-08-31)",
  sourceUrl: "https://www.data.go.kr/data/15044419/fileData.do",
};

const SHIN_ET_AL = {
  sourceLabel: "신성일·이상준·이창훈(2019), 「스마트카드자료를 활용한 지하철 승강장 동적 혼잡도 분석모형」, 한국ITS학회논문지 18(5)",
  sourceUrl: "https://doi.org/10.12815/kits.2019.18.5.49",
};

const KR_T_03011 = {
  sourceLabel: "국가철도공단 KR T-03011 「광역철도역의 연계교통시설 계획 및 설치 기준」 Rev.2 (2025-07-04)",
  sourceUrl: "http://www.kric.go.kr/jsp/board/portal/sub02/bui/railBuildList.jsp?q_type=KR003&q_bulid=1007",
};

export const TRAVEL_PARAMETERS = {
  walkSpeed: {
    label: "보행속도",
    value: 1.2,
    unit: "m/s",
    status: "출처",
    ...SEOUL_METRO_TRANSFER,
    note: "\"일반적인 보행속도인 초당 1.2m를 기준으로 최단환승거리를 보행속도로 나누어 산출\"(데이터 설명)",
  },
  walkDetour: {
    label: "보행 우회계수",
    value: 1.3,
    unit: "배",
    status: "가정값",
    note: "지점↔역 직선거리에 곱한다. v2에서 OSM 보행망 최단거리로 대체",
  },
  accessRadius: {
    label: "보행 접근 반경",
    value: 1500,
    unit: "m",
    status: "가정값",
    note: "지점에서 이 반경 안의 역만 보행으로 연결한다",
  },
  accessCandidates: {
    label: "보행 연결 후보 역",
    value: 3,
    unit: "곳",
    status: "가정값",
  },
  entry: {
    label: "역 진입 (게이트→승강장)",
    value: 180,
    unit: "초",
    status: "문헌 가정",
    ...SHIN_ET_AL,
    note: "\"게이트 진입에서 승차시간은 3분\"(분석 가정값). 역사 심도는 반영하지 않는다(v2)",
  },
  exit: {
    label: "역 진출 (하차→게이트)",
    value: 60,
    unit: "초",
    status: "문헌 가정",
    ...SHIN_ET_AL,
    note: "\"하차에서 게이트 진출은 1분\"(같은 논문의 분석 가정값)",
  },
  waitRatio: {
    label: "대기시간 / 배차간격",
    value: 0.5,
    unit: "배",
    status: "문헌 가정",
    sourceLabel: "김병관·김동호(2021) 「지역 간 철도통행자의 대기시간 특성에 관한 연구」, 한국철도학회논문집 24(3)",
    sourceUrl: "https://www.kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiView.kci?sereArticleSearchBean.artiId=ART002704467",
    note: "\"배차간격의 1/2을 일반적으로 적용\". 같은 논문은 배차가 긴 지역 간 철도에는 맞지 않을 수 있다고 지적한다",
  },
  transfer: {
    label: "기존 환승역 환승보행",
    value: 1.2,
    unit: "m/s로 최단환승거리 나눔",
    status: "출처",
    ...SEOUL_METRO_TRANSFER,
    note: "145개 방향별 환승거리. 한 방향만 있는 역은 반대 방향 값을 쓴다",
  },
  transferFallback: {
    label: "환승보행 (거리 자료 없음)",
    value: 150,
    unit: "초",
    status: "가정값",
    note: "코레일 운영 환승역(금정 등)처럼 서울교통공사 자료에 없는 환승. 180m ÷ 1.2m/s",
  },
  futureTransfer: {
    label: "장래 환승역 환승보행",
    value: 150,
    unit: "초",
    status: "가정값",
    ...KR_T_03011,
    note: "4.4(2) \"환승통로 입출구간 평면환산거리가 가급적 180미터를 넘지 않도록\"를 상한으로 보고 180m ÷ 1.2m/s. GTX-A 서울역·수서는 실측 환승거리를 쓴다",
  },
  sameStationTransfer: {
    label: "같은 역·같은 호선 갈아타기 보행",
    value: 0,
    unit: "초",
    status: "가정값",
    note: "같은 역에서 다른 계통으로 갈아탈 때 거리 자료가 없으면 보행 0, 대기만 반영(성수·신도림·강동은 환승거리 자료 사용)",
  },
} satisfies Record<string, TravelParameter>;

export const WALK_SENSITIVITY = [
  {
    value: 1.0,
    status: "문헌 가정",
    sourceLabel: "KR T-03011 Rev.2 5장 표1 주 \"도보속도는 1.0m/sec로 가정\"",
  },
  {
    value: 0.8,
    status: "문헌 가정",
    sourceLabel: "신민정 외, 한국철도학회 2016 추계(KSR2016A307) 대림역 환승통로 실측 LOS D",
  },
] satisfies { value: number; status: ParameterStatus; sourceLabel: string }[];

export type FutureServiceKind = "gtx" | "metro";

// 노선별로 1차 출처 값이 있으면 유형 기본값보다 먼저 쓴다.
export const FUTURE_SERVICE_OVERRIDES: Record<string, { speed?: TravelParameter }> = {
  DONGBUK: {
    speed: {
      label: "동북선 표정속도",
      value: 30.9,
      unit: "km/h",
      status: "출처",
      sourceLabel: "서울시 「내 손안에 서울」 2022-11-29 (서울시 공식 매체, 보도자료 아님)",
      sourceUrl: "https://mediahub.seoul.go.kr/archives/2006289",
      note: "\"표정속도(정차시간 포함 속도) 30.9km/h\", 전 구간 26분·13.4km",
    },
  },
};

// 장래선 운행 파라미터. 기준망 평균값을 쓰는 항목은 앱이 시간표 그래프에서 계산해 채운다.
export const FUTURE_SERVICE: Record<FutureServiceKind, {
  speed: TravelParameter;
  headway: TravelParameter | "base-median";
}> = {
  gtx: {
    speed: {
      label: "GTX 표정속도",
      value: 80,
      unit: "km/h",
      status: "가정값",
      sourceLabel: "파이낸셜뉴스 2022-07-06 보도(2차 출처): GTX-B 민자구간 표정속도 '80㎞/h 이상'",
      sourceUrl: "https://www.fnnews.com/news/202207061257255965",
      note: "1차 원문(국토부 고시·공단 사업내역서) 미대조. 하한값을 GTX 노선 전체에 적용",
    },
    headway: {
      label: "GTX 배차간격",
      value: 10,
      unit: "분",
      status: "가정값",
      note: "공식 계획 배차를 확인하지 못해 둔 값",
    },
  },
  metro: {
    speed: {
      label: "신설 도시·광역철도 표정속도",
      value: 0,
      unit: "km/h",
      status: "가정값",
      note: "1~8호선 공표 시간표의 표정속도(정차 포함)를 신설선에 그대로 적용",
    },
    headway: "base-median",
  },
};

export function futureServiceKind(lineType: string): FutureServiceKind {
  return lineType.includes("GTX") ? "gtx" : "metro";
}

export const BASE_HEADWAY_ASSUMPTION: Omit<TravelParameter, "value"> = {
  label: "신설 도시·광역철도 배차간격",
  unit: "분",
  status: "가정값",
  note: "같은 시간대 1~8호선 구간별 배차의 중앙값을 적용",
};
