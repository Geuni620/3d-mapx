# 프로젝트 비전

## 제품 가설

한국 모빌리티 데이터를 위한 웹 우선 3D 지도 서비스를 만든다.

포트폴리오 목표는 `Real-time Korea Transit 3D Operations & HMI Console`이다. 지도를 중심으로 지하철 노선, 이동 중인 열차, 운영 상태, replay control, 이후 HMI 스타일의 3D telemetry를 보여줄 수 있는 애플리케이션을 목표로 한다.

## 현재 시작점

첫 번째 마일스톤은 의도적으로 작게 잡는다.

- 서울 중심 초기 뷰포트로 한국 지도를 렌더링한다.
- MapLibre를 기본 지도로 사용한다.
- React, TypeScript, Vite 기반을 유지한다.
- 처음부터 전체 커스텀 3D 엔진을 만들지 않고, 교통 레이어를 점진적으로 추가한다.

## 스택 선택 이유

MapLibre는 기본 지도 엔진이다. 지도 타일, 카메라 이동, 라벨, zoom, pitch, bearing, 일반적인 지도 인터랙션을 담당한다.

deck.gl은 나중에 추가할 시각화 레이어다. 경로 path, animated trip, 대량 point set, heatmap, arc, simulation overlay에 유용하다. MapLibre를 대체하기보다 MapLibre 위에 얹는 방식으로 사용한다.

Three.js는 이후 단계의 커스텀 3D 도구다. 앱에 HMI 패널, 센서형 3D 오브젝트, point cloud, 커스텀 차량 모델, 일반 지도 레이어로 표현하기 어려운 시각 효과가 필요할 때 사용한다.

현재 vertical slice에서는 2호선 외선순환·내선순환 위에 Three.js procedural 3량 열차를 MapLibre 공유 WebGL custom layer로 표시한다. 이 모델은 Blender/GLB 없이 geometry와 material을 조합하며, 지도용 visual proxy이므로 실제 편성의 외형·차량 수를 그대로 재현하지 않는다.

## 제품 단계

1. 지도 기반
   - 서울 중심 MapLibre viewport.
   - 안정적인 레이아웃과 전체 화면 지도 surface.
   - 기본 지도 control과 camera preset.

2. 지하철 네트워크 레이어
   - 역 좌표.
   - 노선 및 route geometry.
   - 노선 필터링과 역 선택.
   - 1~9호선 노선 색상 적용.

3. 시뮬레이션 레이어
   - 2호선 외선·내선 timestamp 기반 mock 열차 이동.
   - 역 사이 위치 보간.
   - mock 일정 순항 속도와 역 정차 시간. 실제 운행 수치로 해석하지 않는다.
   - animated route replay.
   - 실시간 GPS가 없는 경우 timetable 또는 도착 정보 기반 위치 추론.

4. 운영 콘솔
   - 열차/노선/incident를 위한 왼쪽 목록.
   - 공간적 맥락을 보여주는 중앙 지도.
   - 선택된 객체 상태를 보여주는 오른쪽 상세 패널.
   - 이벤트 타임라인, 지연/취소/복구 이벤트, KPI 요약.

5. 고급 3D/HMI 트랙
   - deck.gl TripsLayer 또는 custom animated layer.
   - 필요한 경우 Three.js custom 3D object.
   - sensor/telemetry mock stream.
   - 프로젝트가 system UI 방향으로 확장될 경우 향후 Electron 또는 kiosk-style HMI mode.

## 데이터 소스

- OpenStreetMap: 1~8호선의 노선 geometry와 역사 좌표의 기준 데이터.
- OpenStreetMap 2호선 child relation: 외선·내선 및 지선별 directed service route의 기준 데이터.

1~8호선의 노선과 역사 좌표는 공공 API 좌표를 사용하지 않고 OpenStreetMap route master relation을 기준으로 관리한다.

각 데이터 소스마다 다음을 기록한다.

- URL
- license 또는 사용 조건
- update cadence
- 사용 필드
- 변환 단계
- 알려진 gap

## 협업 규칙

이 프로젝트는 pair-programming mode로 개발한다.

- 넓은 범위의 수정 전에는 방향을 먼저 논의한다.
- 명시적인 승인 이후에만 변경을 적용한다.
- 변경은 좁고 되돌리기 쉽게 유지한다.
- 큰 추측성 아키텍처보다 작게 동작하는 vertical slice를 우선한다.
