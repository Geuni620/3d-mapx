import {
  BufferGeometry,
  CircleGeometry,
  Curve,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
} from "three";

const DEFAULT_SEGMENT_COUNT = 48;

export interface CreateSubwayTrainRibbonModelOptions {
  bodyColor: string;
  lineColor: string;
  lengthMeters: number;
  widthMeters?: number;
  heightMeters?: number;
  segmentCount?: number;
  appearance?: "reference" | "metro";
}

export interface SubwayTrainRibbonModel {
  root: Group;
  lengthMeters: number;
  update: (
    curve: Curve<Vector3>,
    progress: number,
    direction?: 1 | -1,
  ) => void;
  dispose: () => void;
}

export function createSubwayTrainRibbonModel({
  bodyColor,
  lineColor,
  lengthMeters,
  widthMeters = 3.4,
  heightMeters = 2.7,
  segmentCount = DEFAULT_SEGMENT_COUNT,
  appearance = "reference",
}: CreateSubwayTrainRibbonModelOptions): SubwayTrainRibbonModel {
  const safeSegmentCount = Math.max(2, Math.round(segmentCount));
  const isMetro = appearance === "metro";
  const bodyGeometry = createRibbonGeometry(safeSegmentCount);
  const bodyMaterial = new MeshStandardMaterial({
    color: bodyColor,
    metalness: 0.08,
    roughness: 0.72,
  });
  const accentGeometry = new BufferGeometry();
  const accentMaterial = new LineBasicMaterial({ color: lineColor });
  const endGeometry = new SphereGeometry(widthMeters / 2, 14, 8);
  const body = new Mesh(bodyGeometry, bodyMaterial);
  const accent = new Line(accentGeometry, accentMaterial);
  const front = new Mesh(endGeometry, bodyMaterial);
  const rear = new Mesh(endGeometry, bodyMaterial);
  const windowMaterial = new MeshStandardMaterial({
    color: "#17252b",
    metalness: 0.12,
    roughness: 0.38,
    side: DoubleSide,
  });
  const windowGeometries = isMetro
    ? [createSideBandGeometry(safeSegmentCount), createSideBandGeometry(safeSegmentCount)]
    : [];
  const windowBands = windowGeometries.map(
    (geometry) => new Mesh(geometry, windowMaterial),
  );
  const sideAccentGeometries = isMetro
    ? [createSideBandGeometry(safeSegmentCount), createSideBandGeometry(safeSegmentCount)]
    : [];
  const sideAccentMaterial = new MeshBasicMaterial({
    color: lineColor,
    side: DoubleSide,
  });
  const sideAccents = sideAccentGeometries.map(
    (geometry) => new Mesh(geometry, sideAccentMaterial),
  );
  const cabGeometry = isMetro
    ? new CircleGeometry(widthMeters * 0.31, 18)
    : undefined;
  const cabWindows = cabGeometry
    ? [
        new Mesh(cabGeometry, windowMaterial),
        new Mesh(cabGeometry, windowMaterial),
      ]
    : [];
  const root = new Group();

  body.name = "train-ribbon-body";
  accent.name = "train-ribbon-line-accent";
  front.name = "train-ribbon-front";
  rear.name = "train-ribbon-rear";
  accent.visible = !isMetro;
  front.scale.z = heightMeters / widthMeters;
  rear.scale.z = heightMeters / widthMeters;
  windowBands.forEach((windowBand, index) => {
    windowBand.name = `train-ribbon-window-band-${index + 1}`;
  });
  sideAccents.forEach((sideAccent, index) => {
    sideAccent.name = `train-ribbon-side-accent-${index + 1}`;
  });
  cabWindows.forEach((cabWindow, index) => {
    cabWindow.name = `train-ribbon-cab-window-${index + 1}`;
  });
  root.name = "subway-train-ribbon";
  root.add(
    body,
    front,
    rear,
    accent,
    ...windowBands,
    ...sideAccents,
    ...cabWindows,
  );

  return {
    root,
    lengthMeters,
    update(curve, progress, direction = 1) {
      const curveLength = curve.getLength();
      const lengthProgress = lengthMeters / curveLength;
      const centers = Array.from(
        { length: safeSegmentCount + 1 },
        (_, pointIndex) => {
          const pointProgress = clamp(
            progress -
              direction *
                (pointIndex / safeSegmentCount) *
                lengthProgress,
            0,
            1,
          );

          return curve.getPointAt(pointProgress);
        },
      );

      updateRibbonGeometry(
        bodyGeometry,
        centers,
        widthMeters,
        0.35,
        0.35 + heightMeters,
      );
      accentGeometry.setFromPoints(
        centers.map(
          (center) =>
            new Vector3(center.x, center.y, 0.35 + heightMeters + 0.035),
        ),
      );
      front.position.set(
        centers[0].x,
        centers[0].y,
        0.35 + heightMeters / 2,
      );
      rear.position.set(
        centers.at(-1)?.x ?? 0,
        centers.at(-1)?.y ?? 0,
        0.35 + heightMeters / 2,
      );

      if (isMetro) {
        windowGeometries.forEach((geometry, index) => {
          updateSideBandGeometry(
            geometry,
            centers,
            index === 0 ? -1 : 1,
            widthMeters / 2 + 0.025,
            1.42,
            2.48,
          );
        });
        sideAccentGeometries.forEach((geometry, index) => {
          updateSideBandGeometry(
            geometry,
            centers,
            index === 0 ? -1 : 1,
            widthMeters / 2 + 0.045,
            1.08,
            1.3,
          );
        });
        const frontOutward = centers[0].clone().sub(centers[1]).normalize();
        const rearCenter = centers.at(-1);
        const rearPrevious = centers.at(-2);

        if (cabWindows[0] !== undefined) {
          cabWindows[0].position
            .copy(centers[0])
            .addScaledVector(frontOutward, widthMeters * 0.48);
          cabWindows[0].position.z = 0.45 + heightMeters * 0.58;
          cabWindows[0].quaternion.setFromUnitVectors(
            new Vector3(0, 0, 1),
            frontOutward,
          );
        }

        if (
          rearCenter !== undefined &&
          rearPrevious !== undefined &&
          cabWindows[1] !== undefined
        ) {
          const rearOutward = rearCenter.clone().sub(rearPrevious).normalize();

          cabWindows[1].position
            .copy(rearCenter)
            .addScaledVector(rearOutward, widthMeters * 0.48);
          cabWindows[1].position.z = 0.45 + heightMeters * 0.58;
          cabWindows[1].quaternion.setFromUnitVectors(
            new Vector3(0, 0, 1),
            rearOutward,
          );
        }
      }
    },
    dispose() {
      bodyGeometry.dispose();
      accentGeometry.dispose();
      endGeometry.dispose();
      windowGeometries.forEach((geometry) => geometry.dispose());
      sideAccentGeometries.forEach((geometry) => geometry.dispose());
      cabGeometry?.dispose();
      bodyMaterial.dispose();
      accentMaterial.dispose();
      sideAccentMaterial.dispose();
      windowMaterial.dispose();
      root.clear();
    },
  };
}

function createSideBandGeometry(segmentCount: number) {
  const geometry = new BufferGeometry();
  const indices: number[] = [];

  for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
    const current = segmentIndex * 2;
    const next = (segmentIndex + 1) * 2;

    addQuad(indices, current, next, next + 1, current + 1);
  }

  geometry.setIndex(indices);
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute((segmentCount + 1) * 2 * 3, 3),
  );

  return geometry;
}

export function getSubwayTrainRibbonProgressBounds(
  curve: Curve<Vector3>,
  lengthMeters: number,
) {
  const lengthProgress = lengthMeters / curve.getLength();

  return {
    minimum: lengthProgress,
    maximum: 1,
  };
}

function createRibbonGeometry(segmentCount: number) {
  const geometry = new BufferGeometry();
  const indices: number[] = [];

  for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
    const current = segmentIndex * 4;
    const next = (segmentIndex + 1) * 4;

    addQuad(indices, current, next, next + 1, current + 1);
    addQuad(indices, current + 2, current + 3, next + 3, next + 2);
    addQuad(indices, current, current + 2, next + 2, next);
    addQuad(indices, current + 1, next + 1, next + 3, current + 3);
  }

  addQuad(indices, 0, 1, 3, 2);
  const last = segmentCount * 4;
  addQuad(indices, last, last + 2, last + 3, last + 1);
  geometry.setIndex(indices);
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute((segmentCount + 1) * 4 * 3, 3),
  );

  return geometry;
}

function updateRibbonGeometry(
  geometry: BufferGeometry,
  centers: Vector3[],
  width: number,
  bottomZ: number,
  topZ: number,
) {
  const positions = geometry.getAttribute("position");
  const halfWidth = width / 2;

  centers.forEach((center, pointIndex) => {
    const previous = centers[Math.max(0, pointIndex - 1)];
    const next = centers[Math.min(centers.length - 1, pointIndex + 1)];
    const tangent = next.clone().sub(previous).normalize();
    const sideX = -tangent.y * halfWidth;
    const sideY = tangent.x * halfWidth;
    const vertexIndex = pointIndex * 4;

    positions.setXYZ(
      vertexIndex,
      center.x + sideX,
      center.y + sideY,
      bottomZ,
    );
    positions.setXYZ(
      vertexIndex + 1,
      center.x - sideX,
      center.y - sideY,
      bottomZ,
    );
    positions.setXYZ(
      vertexIndex + 2,
      center.x + sideX,
      center.y + sideY,
      topZ,
    );
    positions.setXYZ(
      vertexIndex + 3,
      center.x - sideX,
      center.y - sideY,
      topZ,
    );
  });

  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
}

function updateSideBandGeometry(
  geometry: BufferGeometry,
  centers: Vector3[],
  sideSign: -1 | 1,
  sideOffset: number,
  bottomZ: number,
  topZ: number,
) {
  const positions = geometry.getAttribute("position");

  centers.forEach((_, pointIndex) => {
    const bottom = getOffsetPoint(
      centers,
      pointIndex,
      sideSign,
      sideOffset,
      bottomZ,
    );
    const top = bottom.clone();

    top.z = topZ;
    positions.setXYZ(pointIndex * 2, bottom.x, bottom.y, bottom.z);
    positions.setXYZ(pointIndex * 2 + 1, top.x, top.y, top.z);
  });

  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
}

function getOffsetPoint(
  centers: Vector3[],
  pointIndex: number,
  sideSign: number,
  sideOffset: number,
  z: number,
) {
  const center = centers[pointIndex];
  const previous = centers[Math.max(0, pointIndex - 1)];
  const next = centers[Math.min(centers.length - 1, pointIndex + 1)];
  const tangent = next.clone().sub(previous).normalize();

  return new Vector3(
    center.x - tangent.y * sideOffset * sideSign,
    center.y + tangent.x * sideOffset * sideSign,
    z,
  );
}

function addQuad(
  indices: number[],
  topLeft: number,
  topRight: number,
  bottomRight: number,
  bottomLeft: number,
) {
  indices.push(topLeft, topRight, bottomRight, topLeft, bottomRight, bottomLeft);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
