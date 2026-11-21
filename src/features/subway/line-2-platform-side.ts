type CircleDirection = "inner-loop" | "outer-loop";
export type PlatformSide = "left" | "right";

// 서울교통공사 2380호 객실에 게시된 2호선 안내도에서 '왼쪽 문 열림'과 '오른쪽 문 열림'을 판독했다.
// 표시기 설치업체 노크의 현장 사진. 공개한 사업기간은 2022년 5~12월이며 정확한 촬영일은 명시하지 않았다.
// 이 값은 당시 본선 안내 표기이며 현행 개별 열차의 문 신호·배정 승강장 재측정값은 아니다.
// https://knowck.com/portfolio/prt00030
// https://knowck.com/assets/frt/img/portfolios/prt00030/subway201.jpg
// 2024년 공사·또타 자료: 왕십리→한양대 내선, 아현의 충정로·이대 양 방면 모두 오른쪽.
// https://clik.nanet.go.kr/clikr-collection/policyinfo/77/313/2024/CLIKC1135562658683374_attach_2.pdf
// https://mediahub.seoul.go.kr/uploads/mediahub/2024/07/ihMrDiGmRoSLDgMmfrhweiJooszFbZBk.jpg
// 2025년 삼성 양쪽 운행방향 왼쪽·선릉 양쪽 운행방향 오른쪽 확인. 삼성역 개량 후 갱신 대상.
// https://mediahub.seoul.go.kr/archives/2014434
const signs: Record<PlatformSide, readonly string[]> = {
  left: ["시청", "삼성", "서울대입구", "봉천", "신림", "홍대입구", "이대", "충정로"],
  right: [
    "을지로입구", "을지로3가", "을지로4가", "동대문역사문화공원", "신당", "상왕십리",
    "왕십리", "한양대", "뚝섬", "건대입구", "구의", "강변", "잠실나루", "잠실", "잠실새내",
    "종합운동장", "선릉", "역삼", "강남", "교대", "서초", "방배", "사당", "낙성대",
    "신대방", "구로디지털단지", "대림", "문래", "영등포구청", "당산", "합정", "신촌", "아현",
  ],
};

// 운영사 표기는 이 역들의 통상 본선 양 방향에 공통이다. 성수·신도림은
// 분기·시종착 때 실제 배정 승강장이 달라질 수 있어 단일 노선도에서 일반화하지 않는다.
const sides = new Map<string, Record<CircleDirection, PlatformSide>>();
for (const side of ["left", "right"] as const) {
  for (const station of signs[side]) sides.set(station, { "inner-loop": side, "outer-loop": side });
}

export function getPlatformSide(station: string, direction: CircleDirection): PlatformSide | null {
  const name = station.trim().split("(")[0].trim().replace(/역$/, "");
  return sides.get(name)?.[direction] ?? null;
}
