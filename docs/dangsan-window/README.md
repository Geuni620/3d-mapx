# 당산철교의 퇴근길 · 차창 너머

2026년 11월 21일 내선 2280 열차의 세 번째 객차 왼쪽 창가에서 당산철교를 건너는 27초 영상이다. 서울교통공사 시간표와 OSM 선로로 열차 위치를 추정했다. 창틀과 반사, 대각 철재, 식생과 노을은 이 장면을 위해 재구성했다. [승인 영상](week-ending-v2/week-ending-v2.mp4) · [방송 대본](week-ending-v2/week-ending.txt)

| 프레임 (60 fps, 0부터 시작) | 장면 |
| --- | --- |
| 0 | [창가의 트러스](week-ending-v2/week-ending-v2-01-truss.png) |
| 986 | [철교 너머 노을](week-ending-v2/week-ending-v2-02-sunset.png) |
| 1404 | [한강 수면](week-ending-v2/week-ending-v2-03-river.png) |
| 1544–1619 | 검은 배경에 합성 음성 고지 및 지도 출처 |

## 자료 출처

- v2에 적용한 표기는 [승인본 크레디트](week-ending-v2/week-ending-v2-credits.txt)에 있다. 내레이션은 Supertonic 3 M4 합성 음성이고 주행음도 직접 합성했다. 두 소리는 원본 `week-ending.mp4`의 48 kHz 스테레오 AAC 트랙으로 함께 들어 있다. 엔딩 글꼴은 Noto Sans KR 가변 글꼴의 굵기 470이다.
- [기초 영상 출처 기록](credits.txt)에는 OSM 철교 way, OpenFreeMap 벡터 타일 스냅샷, OpenMapTiles 스키마, Mapzen 지형의 USGS·NOAA 원자료, 서울교통공사 시간표, 글꼴과 음성 모델의 출처·라이선스가 있다. 이 기록의 M2 음성과 글꼴 굵기 550은 앞선 `final.mp4`에 해당한다.
- [방송 시안 출처](week-ending-v2/script-and-credits.txt)는 첫 인사말과 인터뷰 참고 자료를 기록한 문서다. 최종 방송 문안은 위 대본에서 확인할 수 있다.

## 촬영 소스 확인

[촬영 진입점](../../scripts/window-film/setup.js)은 웹앱의 시간표, 철교, 강안, 열차, 조명 모듈을 직접 불러온다. 촬영 카메라는 `train-car-3`의 좌표계를 사용한다. [프레임 합성](../../scripts/window-film/sampler.js)은 배경 2회와 가까운 철재 18회를 샘플링한 뒤 창틀과 실내등 반사를 그린다.

저장소 루트에서 의존성을 설치하고 Vite를 한 터미널에서 실행한다.

```sh
pnpm install --frozen-lockfile
pnpm dev --host 127.0.0.1 --port 5173 --strictPort
```

다른 터미널에서 같은 저장소 루트로 이동해 아래 명령을 실행한다. `uv`와 WebGL2를 지원하는 Google Chrome이 필요하다. Playwright가 임시 프로필로 헤드리스 Chrome을 실행하고 대표 프레임 세 장을 메모리에서 검사한다.

```sh
uv run scripts/window-film/capture.py --port 5173 --check
```

전체 촬영에는 Chrome의 WebCodecs H.264 인코더가 필요하다. [후반 작업](../../scripts/window-film/finish.py)은 FFmpeg의 `drawtext`, `libx264`, FFprobe와 Noto Sans KR 가변 TTF를 사용한다. 아래 글꼴 인수에는 내려받은 파일 경로를 넣는다. 기본 음원은 동봉한 승인본의 AAC 트랙이며, `--audio-from`으로 원본 `week-ending.mp4`를 지정할 수도 있다. 두 입력 모두 동일한 AAC 해시를 검사한다. [Noto Sans KR 원본과 OFL](https://github.com/google/fonts/tree/main/ofl/notosanskr)

```sh
film_dir="$(mktemp -d)"
uv run scripts/window-film/capture.py --work-dir "$film_dir/take"
uv run scripts/window-film/finish.py --work-dir "$film_dir/take" \
  --font './NotoSansKR[wght].ttf' --output "$film_dir/delivery"
```
