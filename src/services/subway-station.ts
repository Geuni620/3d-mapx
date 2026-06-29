const SEOUL_SUBWAY_STATIONS_ENDPOINT =
  "https://api.odcloud.kr/api/15099316/v1/uddi:bc51de47-d3ea-4aa1-8ac2-d70f2b5e701e";

const DEFAULT_PAGE = 1;
const DEFAULT_PER_PAGE = 300;

export type SubwayLineNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

interface SeoulSubwayStationApiRow {
  연번: number;
  호선: SubwayLineNumber;
  "고유역번호(외부역코드)": number;
  역명: string;
  위도: string;
  경도: string;
  작성일자: string;
  작성기준일: string;
}

interface SeoulSubwayStationsResponse {
  page: number;
  perPage: number;
  totalCount: number;
  currentCount: number;
  matchCount: number;
  data: SeoulSubwayStationApiRow[];
}

export interface SeoulSubwayStation {
  id: number;
  lineNumber: SubwayLineNumber;
  sequence: number;
  name: string;
  latitude: number;
  longitude: number;
  openedAt: string;
  referenceDate: string;
}

export async function fetchSeoulSubwayStations(
  signal?: AbortSignal,
): Promise<SeoulSubwayStation[]> {
  const url = new URL(SEOUL_SUBWAY_STATIONS_ENDPOINT);

  url.searchParams.set("page", String(DEFAULT_PAGE));
  url.searchParams.set("perPage", String(DEFAULT_PER_PAGE));
  url.searchParams.set(
    "serviceKey",
    import.meta.env.VITE_SEOUL_DATA_SERVICE_KEY_DECODING,
  );

  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch Seoul subway stations: ${response.status}`,
    );
  }

  const result: SeoulSubwayStationsResponse = await response.json();

  return result.data.map(normalizeStation).sort(sortByLineAndSequence);
}

function normalizeStation(row: SeoulSubwayStationApiRow): SeoulSubwayStation {
  return {
    id: row["고유역번호(외부역코드)"],
    lineNumber: row["호선"],
    sequence: row["연번"],
    name: row["역명"],
    latitude: Number(row["위도"]),
    longitude: Number(row["경도"]),
    openedAt: row["작성일자"],
    referenceDate: row["작성기준일"],
  };
}

function sortByLineAndSequence(
  a: SeoulSubwayStation,
  b: SeoulSubwayStation,
): number {
  if (a.lineNumber !== b.lineNumber) {
    return a.lineNumber - b.lineNumber;
  }

  return a.sequence - b.sequence;
}
