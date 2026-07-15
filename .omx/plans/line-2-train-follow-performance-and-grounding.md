# 2호선 열차 모션 품질·카메라 추적·노선 밀착 개선 계획

## 진행 상태

- [x] 밀리초 단위 연속 위치 계산 및 monotonic runtime clock 적용
- [x] jerk-limited S-curve 가속·순항·감속 프로필 적용
- [x] 대차 chord 기반 차량 heading 적용
- [x] 30Hz 제한 제거 및 delta-time 기반 카메라 감쇠 적용
- [x] 매 프레임 시각 변환 제거, timeline 이진 탐색 적용
- [x] Train ON 추적 상태 브라우저 성능 게이트 확인
- [ ] 사용자 승인 후 단위 테스트·lint·build 실행
- [ ] 실제 화면에서 모션 감각 최종 조정

## 참고 모션 판정

- 참고 영상: https://x.com/Colin_d_m/status/1949532927500701927
- 영상에서 카메라는 거의 고정되어 있고, 열차가 3D 선로 위를 일정한 화면 갱신 간격으로 연속 이동한다.
- 따라서 목표 품질의 중심은 일반적인 `easeInOut` 한 번이 아니라 다음 세 가지다.
  1. 열차 위치가 매 렌더 프레임에서 연속적으로 평가될 것
  2. 곡선에서 차량 방향이 선분 단위로 꺾이지 않을 것
  3. 출발·정차 시 속도뿐 아니라 가속도 변화도 부드러울 것
- 전체 물리 엔진은 필요하지 않다. `속도 제한 + 가속도 + 감속도 + jerk 제한`을 가진 1차원 운행 프로필이면 충분하다.
- 카메라에는 일회성 easing보다 delta-time 기반 critically damped follow가 적합하다. 열차 위치에 약간 늦게 수렴하되 overshoot와 프레임 의존성을 만들지 않는다.

## 요구사항 요약

- Inspector의 기존 `2호선 Train` 토글 계약을 유지한다 (`src/features/subway/seoul-subway-explorer.tsx:45`).
  - OFF: 열차 레이어와 추적 종료
  - OFF → ON: 2호선만 선택하고 열차 레이어 및 추적 시작
- 열차는 노선 높이에 붙어 이동한다. 적용된 고도 `0m`, 높이 배율 `1.0`은 유지한다 (`src/features/subway/subway-train-custom-layer.ts:28`).
- 열차 위치, 차량 heading, 카메라 중심을 서로 다른 문제로 분리해 각각 연속성을 보장한다.
- 성능 목표 60fps와 모션 목표를 동시에 만족해야 하며, 부드러움을 위해 렌더 주기를 30fps로 낮추는 방식은 사용하지 않는다.
- 실제 운행 API 연동 전까지 물리값은 설정 가능한 시뮬레이션 파라미터로 둔다.

## 설계 결정

### 열차 위치

- `src/features/subway/line-2-train-simulation.ts:64`처럼 절대 시각에서 상태를 계산하는 결정론적 구조는 유지한다.
- `Date.now()`를 매 프레임 직접 읽는 대신 시작 시각을 한 번 저장하고 `performance.now()`의 경과 시간을 더해 시스템 시계 보정으로 인한 순간 이동을 막는다.
- 역간 운행은 jerk-limited S-curve 속도 프로필로 바꾼다.
  - 최대 가속도 초기 조정 범위: `0.8–1.0 m/s²`
  - 서비스 감속도 초기 조정 범위: `0.9–1.1 m/s²`
  - 최대 jerk 초기 조정 범위: `0.5–0.8 m/s³`
  - 시간대별 `speedProfile`은 순간 속도 변경이 아니라 목표 최고속도 상한으로 사용한다.
- 짧은 역간 거리에서는 최고속도에 도달하지 않는 삼각형/S-curve 프로필을 자동 선택한다.

### 차량 자세

- 현재 sampler의 중심 좌표 보간은 유지한다 (`src/features/subway/subway-route-sampler.ts:76`).
- heading은 현재 선분의 고정 heading을 바로 쓰지 않는다 (`src/features/subway/subway-route-sampler.ts:97`).
- 차량 중심에서 앞뒤 대차 거리만큼 경로를 샘플링하고, 두 대차를 잇는 chord로 차량 중심과 heading을 계산한다.
- 초기 대차 중심 오프셋은 `4.5m`로 두고 모델 치수 상수와 함께 관리한다.
- 모든 차량은 동일한 front pose를 복사하지 않고 현재처럼 차량 간격만큼 서로 다른 경로 위치를 샘플링한다.
- Catmull-Rom spline은 OSM 노선 밖으로 overshoot할 수 있으므로 1차 구현에는 넣지 않는다. chord 자세만으로 부족한 구간이 측정될 때 제한된 corner fillet을 검토한다.

### 카메라 추적

- 현재 적용된 30Hz hard throttle은 제거 대상으로 본다 (`src/components/subway-train-layer.tsx:11`). 이 제한은 성능은 확보하지만 배경 이동을 계단식으로 보이게 할 수 있다.
- custom layer가 매 프레임 최신 선두 열차 목표 좌표를 제공하고, 카메라는 display refresh cadence에서 별도 smoothing 상태를 갱신한다.
- smoothing은 delta-time 기반 critically damped spring 또는 지수 half-life 방식으로 구현한다.
  - 초기 camera half-life: `100–160ms`
  - overshoot: 허용하지 않음
  - 정차 시 미세 진동: 허용하지 않음
- 카메라가 이동한 프레임에는 `jumpTo()`/camera transform이 repaint 소유자가 되고 custom layer의 추가 `triggerRepaint()`는 호출하지 않는다 (`src/features/subway/subway-train-custom-layer.ts:203`).
- 사용자가 드래그하거나 줌을 조작하면 smoothing 상태까지 초기화하고 추적만 종료한다 (`src/components/seoul-subway-map.tsx:103`).

## 수용 기준

1. OFF → ON 시 2호선만 선택되고 줌 16·pitch 60으로 진입한 뒤 외선 열차를 추적한다 (`src/components/seoul-subway-map.tsx:72`).
2. ON → OFF 시 열차와 추적이 모두 중지된다.
3. 사용자 지도 조작 시 열차 레이어는 ON으로 남고 추적만 종료된다.
4. 정차 출발 전후 속도가 `0 → 양수 → 0`으로 연속 변화하며 한 프레임에서 즉시 최고속도로 바뀌지 않는다.
5. 가속도는 설정 상한을 넘지 않고, jerk는 설정값의 5% 허용오차 안에 들어온다.
6. 열차는 정차 완료 시 목표 역사 거리의 `±0.25m` 안에 있고 dwell 동안 속도가 정확히 0이다.
7. 경로 vertex 전후 `0.1m` 샘플의 heading 차이는 `0.01rad`보다 작다.
8. 3량 차량은 곡선에서도 각각 독립 pose를 가지며 차간 간격 오차가 `±0.15m` 이내다.
9. 추적 카메라는 60Hz rAF 측정에서 반복적인 30Hz 계단 패턴이 없어야 하고 overshoot 없이 목표 좌표에 수렴한다.
10. 동일한 headed 브라우저·1440×900 조건에서 5초 rAF 평균은 `55fps 이상`, p95 frame time은 `20ms 이하`다.
11. 열차 기준 고도 `0m`, 높이 배율 `1.0`을 유지하며 pitch 60에서 차륜 하단이 노선 중심과 시각적으로 분리되지 않는다.
12. `pnpm test`, `pnpm lint`, `pnpm build`가 통과한다.

## 구현 단계

### 1. 모션 기준선 기록

- `agent-browser record`로 현재 추적 상태를 10초간 기록한다.
- 다음 세 상태를 같은 뷰포트에서 각각 측정한다.
  - Train OFF: MapLibre + Deck.gl 기준선
  - Train ON, 추적 OFF: 열차 자체 움직임
  - Train ON, 추적 ON: 열차 + 카메라 움직임
- rAF FPS와 frame time을 함께 기록한다. 영상의 부드러움과 FPS 수치를 별개로 평가한다.
- 현재 영상에서 다음 현상을 표시한다.
  - 역 출발/도착 시 순간 속도 변화
  - polyline vertex에서 차량 heading snap
  - 카메라 30Hz hard throttle로 인한 배경 계단 현상

### 2. jerk-limited 운행 프로필 도입

- `src/features/subway/line-2-train-simulation.ts`의 timeline segment에 다음 상태를 추가한다.
  - 시작/종료 속도
  - 시작/종료 가속도
  - segment jerk
  - segment 종류: accelerating / cruising / braking / dwelling
- 역간 거리와 목표 최고속도로 S-curve 구간 길이와 시간을 사전 계산한다.
- `getState(timestamp)`는 해당 segment의 위치·속도·가속도를 해석적으로 계산한다. 프레임별 누적 적분은 사용하지 않는다.
- 시스템 시계 대신 monotonic elapsed time을 제공하는 runtime clock을 `src/features/subway/subway-train-custom-layer.ts`에 둔다.
- 테스트에서 긴 역간 거리와 짧은 역간 거리, 자정 wrap, speed profile 경계, dwell을 각각 검증한다.

### 3. 대차 chord 기반 차량 자세 적용

- `src/features/subway/subway-train-dimensions.ts`를 추가하고 차량 길이, 간격, 대차 오프셋을 한곳에서 관리한다.
- `src/features/subway/subway-route-sampler.ts`에 `sampleSubwayRouteChordPose()`를 추가한다.
- `src/features/subway/line-2-train-simulation.ts:85`의 각 차량 pose 생성에서 일반 `sample()` 대신 chord pose를 사용한다.
- 직선에서는 기존 heading과 같고, 모서리 전후에서는 heading이 연속적으로 변하는지 단위 테스트한다.
- 곡선에서 차량 중심이 노선으로부터 과도하게 벗어나면 midpoint 대신 기존 중심 좌표를 유지하고 heading만 chord로 계산한다.

### 4. 카메라 연속 추적 컨트롤러로 교체

- `src/components/subway-train-layer.tsx`의 30Hz throttle과 좌표 직접 `jumpTo()`를 제거한다.
- 최신 목표 좌표, 현재 smoothed 좌표, 마지막 frame time을 가진 작은 camera-follow controller를 분리한다.
- 매 MapLibre render frame에 delta-time 기반 damping을 적용한다.
- 정차 중 목표 좌표가 같으면 카메라 transform을 반복 설정하지 않는다.
- 카메라가 움직인 프레임과 custom layer repaint가 중복 예약되지 않도록 현재 boolean 반환 계약을 유지한다.
- follow controller의 frame-rate 독립성을 30Hz/60Hz/120Hz 가상 delta-time 테스트로 확인한다. 1초 뒤 위치 오차가 각 주기에서 동일 허용범위 안에 있어야 한다.

### 5. 성능 게이트 및 조건부 배칭

- `Matrix4` 재사용, 고도 0m, 높이 배율 1.0, 중복 repaint 제거 등 이미 적용된 저위험 최적화를 유지한다.
- 2~4단계 적용 후 수용 기준 10을 다시 측정한다.
- 목표 미달 시에만 `src/features/subway/subway-train-model.ts`의 반복 부품을 차량 단위 `InstancedMesh`로 변경한다.
  - 창문
  - 출입문
  - 지붕 장치
  - bogie
  - 전조등·후미등
- 조건부 배칭의 목표는 두 편성 전체 draw call `80 이하`다.

### 6. 상태 전이와 회귀 테스트

- `src/features/subway/subway-line-selection.ts`의 `select-only`를 단위 테스트한다.
- Train 토글과 사용자 지도 조작 상태 전이를 컴포넌트 테스트한다.
- 열차 모델의 geometry 공유와 GPU 자원 해제 테스트를 유지한다 (`src/features/subway/subway-train-model.test.ts:5`).
- `prefers-reduced-motion`에서는 열차와 카메라를 고정하고 불필요한 repaint가 없는지 확인한다.

### 7. 참고 영상 기준 시각 검증

- `agent-browser record`로 after 영상을 같은 1440×900, 줌 16, pitch 60 조건에서 10초간 기록한다.
- before/after를 다음 기준으로 비교한다.
  - 열차가 고정 카메라에서 일정한 프레임 간격으로 전진하는가
  - 곡선에서 차체 방향이 튀지 않는가
  - 출발과 정차가 easing처럼 보이되 실제 속도·가속도 계약을 만족하는가
  - 추적 카메라에서 배경이 30Hz로 계단식 이동하지 않는가
- 스크린샷은 높이·노선 밀착 비교에만 사용하고, 모션 판정은 반드시 영상으로 수행한다.

## 위험과 대응

- **물리값이 실제 2호선 차량과 다를 수 있음**: 초기 범위는 시각 조정용 설정값으로 명시하고 실제 차량 제원 확보 후 교체한다.
- **S-curve가 짧은 역간 거리에서 최고속도를 초과함**: 거리 기반으로 cruise 구간을 생략하고 peak speed를 다시 푼다.
- **spline이 노선을 벗어남**: 1차 구현은 spline을 사용하지 않고 대차 chord heading만 적용한다.
- **카메라 60Hz 갱신으로 FPS가 다시 하락함**: repaint 소유권을 하나로 제한한 상태에서 측정하고, 필요하면 목표 좌표 입력만 낮은 빈도로 받되 출력 smoothing은 display refresh cadence를 유지한다.
- **damping으로 열차가 화면 중심에서 너무 멀어짐**: half-life를 100–160ms 범위에서 조정하고 최대 추적 오차를 화면 폭의 5%로 제한한다.
- **InstancedMesh가 부품별 이름/재질 제어를 깨뜨림**: 배칭은 성능 게이트 미달 시에만 수행하고 기존 모델 계약 테스트를 먼저 고정한다.

## 검증 절차

1. 수정 전 세 상태의 10초 영상과 성능 수치를 기록한다.
2. 운행 프로필 단위 테스트로 위치·속도·가속도·jerk·정차 오차를 검증한다.
3. route sampler 테스트로 vertex 전후 heading 연속성을 검증한다.
4. camera-follow controller를 30/60/120Hz 가상 frame delta로 검증한다.
5. 수정 후 동일 조건의 영상과 rAF/frame-time을 기록한다.
6. 고정 카메라와 추적 카메라를 각각 참고 영상과 비교한다.
7. 목표 FPS 미달 시에만 배칭을 적용하고 다시 측정한다.
8. 사용자 승인 후 `pnpm test`, `pnpm lint`, `pnpm build`를 실행한다.

## 이번 범위에서 제외

- 실제 열차 운행 API 연동
- 실제 2호선 차량 제원 확정
- 카메라 bearing 자동 회전
- 모든 열차 중 추적 대상을 고르는 UI
- Storybook 재구성
- 지하 구간과 실제 건물 occlusion 정책
