# OSM 지하철 네트워크 데이터 생성

이 문서는 서울 지하철 1~8호선의 노선 geometry와 역사 좌표를 OpenStreetMap 데이터에서 내려받아 앱에서 사용할 JSON 파일로 변환하는 과정을 설명한다.

현재 1~8호선의 노선과 역사 좌표는 공공 API 좌표를 사용하지 않고 OpenStreetMap route master relation을 기준으로 관리한다.

## 생성 스크립트

OSM 데이터 생성은 다음 스크립트가 담당한다.

```txt
scripts/generate-osm-subway-network.mjs
```

이 스크립트는 앱 런타임 코드가 아니라 개발 시점에 실행하는 데이터 생성기다.

역할은 다음과 같다.

- OSM route master relation ID를 기준으로 XML 원본 데이터를 내려받는다.
- route master relation에 연결된 하위 route relation을 따라간다.
- relation 안의 node, way, relation 정보를 파싱한다.
- way를 이어서 노선 geometry인 `pathSegments`를 만든다.
- 하위 subway relation별 운행 방향과 stop 순서를 `serviceRoutes`로 보존한다.
- stop, platform 역할의 node를 모아 역사 목록을 만든다.
- 호선별 JSON 파일과 TypeScript wrapper 파일을 생성한다.

## OSM 원본 요청

스크립트는 OSM API의 relation full endpoint를 사용한다.

```txt
https://api.openstreetmap.org/api/0.6/relation/{relationId}/full
```

예를 들어 2호선 route master relation ID가 `7625892`라면 다음 URL을 요청한다.

```txt
https://api.openstreetmap.org/api/0.6/relation/7625892/full
```

이 응답은 XML이다. 앱은 이 XML을 직접 사용하지 않는다. XML은 생성기가 읽는 원본 데이터이고, 앱은 변환된 JSON만 사용한다.

## 캐시 위치

OSM에서 내려받은 XML 원본은 기본적으로 다음 임시 디렉터리에 캐시한다.

```txt
/private/tmp/3d-mapx-osm-subway
```

`/private/tmp`는 macOS의 임시 파일 디렉터리다. 이 캐시는 커밋 대상이 아니며 삭제되어도 다시 생성할 수 있다.

캐시 위치는 환경 변수로 바꿀 수 있다.

```bash
OSM_SUBWAY_CACHE_DIR=.cache/osm-subway node scripts/generate-osm-subway-network.mjs
```

## 출력 파일

생성 결과는 프로젝트 내부에 저장된다.

```txt
src/features/subway/data/osm-subway-line-1.json
src/features/subway/data/osm-subway-line-2.json
src/features/subway/data/osm-subway-line-3.json
src/features/subway/data/osm-subway-line-4.json
src/features/subway/data/osm-subway-line-5.json
src/features/subway/data/osm-subway-line-6.json
src/features/subway/data/osm-subway-line-7.json
src/features/subway/data/osm-subway-line-8.json
```

각 JSON 파일은 해당 호선의 `route`, `stations`, `serviceRoutes`를 가진다.

```ts
interface SeoulSubwayOsmLineNetwork {
  route: SeoulSubwayOsmRoute;
  stations: SeoulSubwayOsmStation[];
  serviceRoutes?: SeoulSubwayOsmServiceRoute[];
}
```

앱에서는 JSON 파일을 직접 흩어서 사용하지 않고 다음 wrapper를 통해 조립된 데이터를 사용한다.

```txt
src/features/subway/osm-subway-network.ts
```

## 실행 방법

캐시된 XML을 우선 사용하려면 다음 명령을 실행한다.

```bash
node scripts/generate-osm-subway-network.mjs
```

OSM에서 새로 내려받으려면 `--refresh`를 붙인다.

```bash
node scripts/generate-osm-subway-network.mjs --refresh
```

특정 호선 JSON만 다시 만들려면 `--line`을 사용한다. 이 경우 다른 호선 JSON과 TypeScript wrapper는 변경하지 않는다.

```bash
node scripts/generate-osm-subway-network.mjs --line 2
```

2호선 `serviceRoutes`에는 외선순환, 내선순환, 성수지선, 신정지선 relation이 각각 보존된다. 현재 열차 시뮬레이션은 외선순환 `2404374`와 내선순환 `4729409`만 소비한다.

새 호선을 추가할 때는 `scripts/generate-osm-subway-network.mjs`의 `ROUTE_MASTERS`에 route master relation ID를 추가한 뒤 스크립트를 다시 실행한다.

## 현재 route master relation ID

```txt
1호선: 8691899
2호선: 7625892
3호선: 7879839
4호선: 7625893
5호선: 7879871
6호선: 7919154
7호선: 7922930
8호선: 7919019
```

## 주의 사항

- OSM 데이터는 외부 커뮤니티 데이터이므로 relation 구조가 바뀔 수 있다.
- 2호선 생성 시 외선·내선 relation ID와 방향이 예상과 다르면 생성기가 실패한다.
- `--refresh` 실행 결과는 기존 JSON과 달라질 수 있으므로 변경 내용을 반드시 지도에서 확인한다.
- 생성된 JSON은 앱에서 사용하는 정적 데이터이므로 커밋 대상이다.
- `/private/tmp/3d-mapx-osm-subway` 아래의 XML 캐시는 임시 원본이므로 커밋하지 않는다.
