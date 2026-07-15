import {
  Color,
  MeshStandardMaterial,
  type Material,
} from "three";

export interface SubwayTrainMaterials {
  body: MeshStandardMaterial;
  roof: MeshStandardMaterial;
  window: MeshStandardMaterial;
  line: MeshStandardMaterial;
  undercarriage: MeshStandardMaterial;
  headlight: MeshStandardMaterial;
  tailLight: MeshStandardMaterial;
  dispose: () => void;
}

// 열차의 차체, 창문, 노선 띠와 조명에 사용할 색상과 표면 질감을 만든다.
export function createSubwayTrainMaterials(
  lineColor: string,
  bodyColor = "#3c4348",
): SubwayTrainMaterials {
  const materials = {
    body: new MeshStandardMaterial({
      color: bodyColor,
      metalness: 0.72,
      roughness: 0.28,
    }),
    roof: new MeshStandardMaterial({
      color: "#22282c",
      metalness: 0.45,
      roughness: 0.5,
    }),
    window: new MeshStandardMaterial({
      color: "#07141b",
      emissive: new Color("#0b2731"),
      emissiveIntensity: 0.65,
      metalness: 0.35,
      roughness: 0.18,
    }),
    line: new MeshStandardMaterial({
      color: lineColor,
      emissive: new Color(lineColor),
      emissiveIntensity: 0.28,
      metalness: 0.2,
      roughness: 0.4,
    }),
    undercarriage: new MeshStandardMaterial({
      color: "#111619",
      metalness: 0.35,
      roughness: 0.65,
    }),
    headlight: new MeshStandardMaterial({
      color: "#fff8d5",
      emissive: new Color("#fff1ae"),
      emissiveIntensity: 3.2,
      roughness: 0.2,
    }),
    tailLight: new MeshStandardMaterial({
      color: "#ff3b3b",
      emissive: new Color("#ff1212"),
      emissiveIntensity: 2.4,
      roughness: 0.25,
    }),
  };

  return {
    ...materials,
    dispose() {
      Object.values(materials).forEach((material: Material) => {
        material.dispose();
      });
    },
  };
}
