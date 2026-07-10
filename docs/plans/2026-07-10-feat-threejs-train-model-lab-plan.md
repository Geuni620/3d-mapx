---
title: "feat: Three.js 열차 Model Lab 추가"
type: feat
date: 2026-07-10
status: implemented
---

# feat: Three.js 열차 Model Lab 추가

## Overview

MapLibre 통합과 분리된 Storybook 공간에서 production `createSubwayTrainModel()`을 직접 렌더링해, Blender 없이 만든 procedural 열차의 형태와 곡선 articulation을 검증한다.

이 계획은 2호선 Three.js 열차 시뮬레이션 이후 별도 Model Lab으로 구현한다.

## Proposed structure

```text
.storybook/
├─ main.ts
└─ preview.ts

src/features/subway/
├─ subway-train-model.ts
└─ model-lab/
   ├─ subway-train-preview.tsx
   ├─ subway-train-model.stories.tsx
   └─ subway-train-motion.stories.tsx
```

Storybook은 별도 모델을 복제하지 않고 제품 코드의 Three.js model factory를 그대로 사용한다. Preview wrapper만 camera, light, renderer, `OrbitControls`, resize와 dispose를 담당한다.

## Stories

### Model / Interactive

- 정면·측면·상단·3/4 camera preset
- 차량 수, 차체색, 노선색, 조명 강도 controls
- 창문, 문, 지붕 장치, 대차 표시 toggle
- wireframe, axes, bounding box toggle
- renderer draw call, triangle, geometry count 표시

### Model / Geometry Audit

- 외부 GLB와 texture 없이 생성되는지 확인
- geometry/material 공유 여부 확인
- 차량 pivot과 앞·뒤 조명 방향 확인
- 고정 camera와 고정 args로 비교 가능한 정적 상태 제공

### Motion / Opposite Directions

- 평행한 synthetic S-curve 두 개 사용
- 3량 열차 두 대를 서로 반대 방향으로 이동
- progress, speed, pause controls 제공
- 각 차량이 독립 distance/tangent를 사용해 곡선에서 꺾이는지 확인

### Motion / Line 2 Inner–Outer

- 실제 2호선 외선 `2404374`, 내선 `4729409` 사용
- simulation timestamp를 고정할 수 있는 story와 live story 분리
- live animation은 수동 점검, fixed timestamp는 비교 캡처에 사용

## Blender decision gate

Three.js를 유지하는 조건:

- 첫 번째 시안의 정면·측면·3/4 silhouette가 충분히 재현된다.
- 모델이 재사용 가능한 geometry rule로 구성된다.
- 세 차량의 곡선 articulation이 자연스럽다.
- texture 없이 창문, 노선 띠, 전조등·후미등이 읽힌다.
- 모델 생성 코드가 유지 가능한 크기로 남는다.

Blender/GLB로 전환하는 조건:

- 실제 차량의 복잡한 운전실 곡면이 필요하다.
- UV, 로고, 차량 번호, 정밀 도색이 필요하다.
- procedural geometry가 vertex 수작업 코드로 변질된다.
- 문, 팬터그래프 등 rigged animation이 필요하다.

## Acceptance criteria

- [x] Storybook React/Vite 구성이 production bundle과 분리된다.
- [x] Interactive story에서 모델을 회전·확대하고 주요 args를 조정할 수 있다.
- [x] Geometry Audit story가 고정된 비교 상태를 제공한다.
- [x] Opposite Directions story에서 두 3량 열차가 곡선을 반대 방향으로 주행한다.
- [x] 각 story unmount 후 Three.js resource와 animation frame이 남지 않는다.
- [x] 실제 Line 2 story는 2호선 service route 데이터 준비 후 추가한다.

## Implementation result

- Storybook `10.4.6`의 React/Vite framework, Docs, A11y addon을 production Vite entry와 분리했다.
- production `createSubwayTrainModel()`에 선택적 body color와 audit 가능한 part name만 추가하고, Storybook 전용 모델 복제는 만들지 않았다.
- Interactive와 Geometry Audit은 한 차량 factory와 공용 preview runtime을 사용한다.
- Opposite Directions는 synthetic S-curve의 arc-length distance와 tangent를 차량별로 샘플링한다.
- Line 2 Fixed/Live는 실제 외선 `2404374`, 내선 `4729409` service route와 timestamp simulation을 사용한다.
- story 전환 후 canvas는 하나만 남고, cleanup에서 RAF, ResizeObserver, OrbitControls, renderer, geometry, material을 정리한다.

## Non-goals

- 현재 2호선 지도 feature의 필수 선행 조건으로 만들지 않는다.
- Chromatic 배포와 cloud visual regression은 초기 범위에서 제외한다.
- Storybook 전용 모델 replica를 만들지 않는다.

## References

- [Storybook for React with Vite](https://storybook.js.org/docs/get-started/frameworks/react-vite)
- [Storybook Controls](https://storybook.js.org/docs/essentials/controls)
- [Storybook UI testing](https://storybook.js.org/docs/writing-tests/index)
- [Three.js OrbitControls](https://threejs.org/docs/pages/OrbitControls.html)
