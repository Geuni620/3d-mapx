import {
  AdditiveBlending,
  Color,
  DoubleSide,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
  TextureLoader,
} from "three";
import liveryUrl from "./assets/line-2-livery.webp";
import lightsUrl from "./assets/line-2-lights.webp";

// 시제품의 닫힌 문·차창·전면 도색을 한 아틀라스에 구웠다. 모든 차량이 두 장만 공유한다.
export function createSubwayTrainMaterials(
  lineColor: string,
  bodyColor = "#ffffff",
  onTextureLoad?: () => void,
) {
  const loader = new TextureLoader();
  const loadTexture = (url: string) => {
    if (typeof document === "undefined") return null;
    const texture = loader.load(url, onTextureLoad);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  };
  const map = loadTexture(liveryUrl);
  const emissiveMap = loadTexture(lightsUrl);
  const skin = new MeshStandardMaterial({
    map,
    emissiveMap,
    emissive: emissiveMap ? "#ffffff" : "#000000",
    emissiveIntensity: 0.74,
    metalness: 0.18,
    roughness: 0.39,
    side: DoubleSide,
  });
  // 방향 비교 스토리에서만 창 아래의 초록 도장을 각 편성의 식별색으로 교체한다.
  if (new Color(lineColor).getHex() !== 0x00a84d) {
    skin.onBeforeCompile = (shader) => {
      shader.uniforms.paintColor = { value: new Color(lineColor) };
      shader.fragmentShader =
        "uniform vec3 paintColor;\n" +
        shader.fragmentShader.replace(
          "#include <map_fragment>",
          `#include <map_fragment>
        float band = smoothstep(0.045, 0.22, diffuseColor.g - max(diffuseColor.r, diffuseColor.b));
        diffuseColor.rgb = mix(diffuseColor.rgb, paintColor * (0.65 + diffuseColor.g), band);`,
        );
    };
  }
  const body = new MeshStandardMaterial({
    color: bodyColor,
    vertexColors: true,
    metalness: 0.3,
    roughness: 0.5,
  });
  const doorLight = new MeshBasicMaterial({
    vertexColors: true,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: false,
  });
  doorLight.forceSinglePass = true;
  return {
    body,
    skin,
    doorLight,
    dispose() {
      skin.dispose();
      body.dispose();
      doorLight.dispose();
      map?.dispose();
      emissiveMap?.dispose();
    },
  };
}
