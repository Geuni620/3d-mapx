# 3d-mapx

한국 모빌리티 데이터를 위한 웹 우선 3D 지도 실험 프로젝트다. MapLibre가 지도와 카메라를, deck.gl이 지하철 노선·역사 시각화를, Three.js가 커스텀 3D 열차 모델을 담당한다.

## 실행

```bash
pnpm install
pnpm dev
```

품질 검증은 다음 명령으로 실행한다.

```bash
pnpm lint
pnpm test
pnpm test:coverage
pnpm build
pnpm build:storybook
```

## 2호선 Three.js 열차

- 2호선 외선순환과 내선순환에 procedural 3량 열차 한 대씩을 표시한다.
- 열차는 2호선 선택, `2호선 Train` ON, zoom `14.5` 초과일 때 렌더링된다.
- 위치는 고정 simulation epoch부터 반복되는 route cycle과 현재 timestamp로 결정된다.
- 역 사이는 demo 순항 속도 `12 m/s`로 이동하고, 각 역에서 `20초` 정차한다.
- Blender/GLB/외부 texture를 사용하지 않는다.
- 속도와 정차 값은 실제 운행 데이터가 아닌 시각 검증용 demo parameter다.

OSM 데이터 재생성 방법은 [docs/osm-subway-network.md](docs/osm-subway-network.md)를 참고한다.

## Three.js Train Model Lab

Blender/GLB 없이 만든 production 열차 모델은 Storybook Model Lab에서 지도와 분리해 점검할 수 있다.

```bash
pnpm storybook
```

빌드가 끝나면 `http://localhost:6006`에서 다음 story를 확인한다.

- `Train Model / Interactive`: camera preset, 차량 수, 차체·노선 색상, 조명과 부품 visibility 조정
- `Train Model / Geometry Audit`: 고정 3/4 camera, bounding box, axes, 공유 geometry와 texture 부재 확인
- `Train Motion / Opposite Directions`: synthetic S-curve 반대 방향 articulation
- `Train Motion / Line 2 Fixed Timestamp`: 일정 속도로 이동 중인 외선·내선의 비교 가능한 고정 시각
- `Train Motion / Line 2 Dwelling`: 역 정차 상태를 재현하는 고정 시각
- `Train Motion / Line 2 Live`: 실제 2호선 service route를 현재 시각으로 재생
