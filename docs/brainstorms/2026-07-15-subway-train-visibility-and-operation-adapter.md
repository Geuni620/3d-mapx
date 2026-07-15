---
date: 2026-07-15
topic: subway-train-visibility-and-operation-adapter
status: draft
---

# 지하철 모형 가시성 및 운행 데이터 어댑터 구상

## 문서 목적

지금까지 논의했지만 아직 적용되지 않은 요구사항을 별도 구상으로 정리한다. 이번 범위는 지하철 모형을 지도에서 명확하게 보이게 만드는 것과, 현재 2호선 Mock 운행값을 KTDB 등 실제 근거 데이터로 교체할 수 있는 확장 구조를 만드는 것이다.

이 문서는 구현 완료 기록이 아니다. 구현 전에 합의해야 할 경계, 인터페이스와 미결정 사항을 기록한다.

## 현재 적용된 기반

- 2호선 OSM 경로 위에 Three.js 열차 모형을 표시한다.
- 열차 위치는 밀리초 단위로 평가한다.
- 역 출발과 도착에는 jerk 제한 S-curve 가감속을 적용한다.
- 차량 방향은 앞뒤 대차 위치를 이용해 계산한다.
- Inspector의 `2호선 Train` 토글로 열차 표시와 카메라 추적을 제어한다.
- 현재 OSM 네트워크 데이터는 1~8호선을 포함한다.

## 아직 적용되지 않은 요구사항

### 열차 모형 가시성

- [ ] 어두운 지도에서도 차체와 노선색을 즉시 식별할 수 있어야 한다.
- [ ] 실제 차량 길이와 차량 간격을 훼손하지 않고 지도용 시각 보정을 적용해야 한다.
- [ ] 줌과 pitch에 따라 지나치게 작아지거나 노선에 묻히는 문제를 확인해야 한다.
- [ ] 차체 색상, 발광, 외곽선, 폭과 높이 배율을 하나의 시각 프로필로 관리해야 한다.
- [ ] 노선 위에 뜨거나 파묻히지 않도록 차륜 하단과 노선 중심의 기준 높이를 명시해야 한다.

초기 방향은 차량 길이와 차량 간격은 실제 단위를 유지하고, 폭·높이·발광·외곽선만 지도 표현에 맞게 보정하는 혼합형이다. 최종 배율은 실제 화면 비교 후 결정한다.

### 운행 데이터 어댑터

- [ ] `subway-train-custom-layer.ts`에 직접 선언된 `MOCK_SPEED_PROFILE`을 제거해야 한다.
- [ ] Mock 운행값과 KTDB 근거 운행값의 출처가 타입과 런타임에서 구분되어야 한다.
- [ ] 1~8호선과 향후 9호선이 같은 시뮬레이션 인터페이스를 사용해야 한다.
- [ ] 노선별 최고속도, 가속도, 감속도, jerk, 정차시간과 역간 거리를 독립적으로 보정할 수 있어야 한다.
- [ ] KTDB 값이 없거나 불완전한 노선은 명시적으로 Mock 어댑터로 대체할 수 있어야 한다.
- [ ] 적용된 원천 데이터, 버전, 보정 규칙을 Inspector 또는 디버그 정보에서 확인할 수 있어야 한다.

## 설계 원칙

### 데이터와 렌더링 분리

Three.js custom layer는 운행 정책을 결정하지 않는다. custom layer는 이미 만들어진 시뮬레이션 설정과 열차 상태를 받아 렌더링만 담당한다.

```text
OSM 경로 geometry
      +
KTDB 또는 Mock 운행 원천
      ↓
SubwayOperationAdapter
      ↓
SubwayTrainSimulationConfig
      ↓
SubwayTrainSimulation
      ↓
Three.js custom layer
```

### 지도 거리와 운행 거리 분리

OSM 경로의 길이와 KTDB에 기록된 역간 거리는 서로 다를 수 있다. 하나의 전역 거리 배율로 경로를 늘이거나 줄이지 않는다.

- 지도 위치: OSM polyline의 누적 거리로 계산한다.
- 운행 시간과 속도: KTDB 역간 거리와 보정된 운행 파라미터로 계산한다.
- 두 체계 연결: 각 역간 구간의 진행률 `0..1`을 OSM 경로의 대응 구간에 매핑한다.

이 구조를 사용하면 KTDB 거리로 운행 특성을 계산하면서도 열차는 항상 지도 노선 위에 남는다.

### 기본값과 보정값 구분

공통 기본값 위에 노선별 보정을 합성한다. 노선마다 별도 시뮬레이터 클래스를 만드는 방식은 피한다.

```ts
interface SubwayOperationAdapter {
  readonly id: string;
  readonly source: "mock" | "ktdb";

  supports(context: SubwayOperationContext): boolean;
  createSimulationConfig(
    context: SubwayOperationContext,
  ): SubwayTrainSimulationConfig;
}

interface SubwayLineCalibration {
  lineNumber: SubwayLineNumber;
  maxSpeedMetersPerSecond: number;
  accelerationMetersPerSecondSquared: number;
  decelerationMetersPerSecondSquared: number;
  jerkMetersPerSecondCubed: number;
  defaultDwellSeconds: number;
  stationIntervals: SubwayStationIntervalCalibration[];
}
```

노선별 객체는 값만 제공하고, S-curve 계산과 경로 샘플링은 공통 시뮬레이터가 계속 담당한다.

## 시각 프로필 구상

운행 단위와 지도 표현 단위를 분리하기 위해 다음과 같은 프로필을 둔다.

```ts
interface SubwayTrainVisualProfile {
  bodyWidthScale: number;
  bodyHeightScale: number;
  emissiveIntensity: number;
  outlineColor?: string;
  minimumVisibleZoom: number;
  displayAltitudeMeters: number;
}
```

시각 프로필은 열차 속도, 차량 길이, 차량 간격과 같은 운행 계산값을 변경하지 않는다. 노선색과 지도 테마에 따라 프로필을 재정의할 수 있지만, 첫 구현에서는 공통 기본 프로필 하나만 사용한다.

## 어댑터 선택과 fallback

어댑터는 등록 순서가 아니라 명시적인 선택 규칙으로 결정한다.

1. 요청한 노선과 방향을 지원하는 KTDB 어댑터를 찾는다.
2. 필요한 역간 자료가 완전하면 KTDB 설정을 반환한다.
3. 자료가 누락되면 오류를 숨기지 않고 provenance에 누락 사유를 기록한다.
4. 개발 환경에서 fallback이 허용된 경우에만 Mock 어댑터를 사용한다.

Mock과 KTDB 값을 조용히 섞지 않는다. 일부 역간 구간만 보정해야 한다면 어떤 구간이 보정되었는지 결과 설정에 기록한다.

## 단계별 적용 구상

### 1단계: 모형 가시성 vertical slice

- 시각 프로필 타입과 기본 프로필을 추가한다.
- 차체 대비, 노선색 발광과 선택적 외곽선을 강화한다.
- 폭·높이 보정은 적용하되 길이와 차량 간격은 유지한다.
- 줌 15~18, pitch 0~75 범위에서 2호선 모형을 비교한다.

### 2단계: Mock 어댑터 분리

- 현재 2호선 Mock 속도 프로필과 dwell 값을 `MockSubwayOperationAdapter`로 이동한다.
- custom layer는 adapter가 만든 공통 설정만 받도록 변경한다.
- 시뮬레이터에서 노선 번호나 KTDB를 직접 참조하지 않도록 유지한다.

### 3단계: KTDB 보정 모델 정의

- 사용할 KTDB 자료의 정확한 데이터셋, 필드, 기준연도, 라이선스와 갱신 주기를 확정한다.
- OSM 역사와 KTDB 역사 식별자를 연결하는 매핑을 만든다.
- 역간 공식 거리와 OSM 구간 거리의 매핑 결과 및 누락 구간을 검증한다.
- 첫 실제 어댑터는 2호선 한 방향에만 적용한다.

### 4단계: 1~9호선 확장

- 노선별 calibration 데이터를 추가한다.
- 순환선과 왕복 노선의 방향·종착 처리 차이를 공통 context로 표현한다.
- 9호선 OSM geometry와 역사 데이터가 현재 저장소에 없으므로 별도 수집·검증 범위로 둔다.
- 급행과 일반처럼 같은 노선에서 정차 패턴이 다른 경우 운행 패턴 식별자를 추가한다.

## 수용 기준 초안

- 열차가 줌 16, pitch 60에서 노선과 구분되어 육안으로 식별된다.
- 실제 차량 길이와 차량 간격은 시각 프로필에 의해 변경되지 않는다.
- custom layer에 노선별 속도와 dwell 상수가 남아 있지 않는다.
- 동일 시뮬레이터가 Mock과 KTDB adapter 결과를 모두 처리한다.
- 시뮬레이션 상태에서 사용한 데이터 source와 adapter ID를 확인할 수 있다.
- KTDB 역간 거리와 OSM 경로 거리가 달라도 열차 중심은 OSM 노선 위에 유지된다.
- KTDB 자료가 누락되었을 때 fallback 여부와 사유가 명시적으로 드러난다.
- 1~8호선 및 향후 9호선 추가가 시뮬레이터 수정이 아니라 adapter/calibration 추가로 가능하다.

## 추가로 확정해야 할 사항

- 모형 외곽선을 실제 geometry로 추가할지, emissive 재질만 사용할지
- 폭·높이 보정 배율과 줌별 최소 가시성 기준
- KTDB에서 사용할 정확한 데이터셋과 역 식별자 매핑 기준
- KTDB distance를 운행 계산에 사용하는 방식과 시간표 자료의 우선순위
- 9호선 geometry 수집 시점과 급행·일반 패턴 범위
- 프로덕션에서 Mock fallback을 허용할지 여부

## 다음 단계

1. 모형 가시성 표현 방식을 화면 비교로 확정한다.
2. KTDB 후보 데이터셋과 현재 OSM 역사 식별자의 연결 가능성을 조사한다.
3. 위 결정을 기반으로 파일 단위 구현 계획과 테스트 전략을 작성한다.

