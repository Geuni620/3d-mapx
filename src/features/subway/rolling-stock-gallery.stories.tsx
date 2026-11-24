import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Color, DirectionalLight, HemisphereLight, Mesh, MeshStandardMaterial,
  type Material, type Object3D, PerspectiveCamera, Scene, type Texture, Vector3, WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { SUBWAY_LINE_COLORS } from "./subway-constants";

export default {
  title: "Subway/1–9호선 차량 비교",
  id: "subway-rolling-stock-gallery",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

type ModelLine = keyof typeof SUBWAY_LINE_COLORS;
type Line = ModelLine | 9;
const colors = { ...SUBWAY_LINE_COLORS, 9: "#C9A749" };
const licenses = {
  "CC BY 3.0": "licenses/by/3.0/",
  "CC BY-SA 2.0": "licenses/by-sa/2.0/",
  "CC BY-SA 3.0": "licenses/by-sa/3.0/",
  "CC BY-SA 4.0": "licenses/by-sa/4.0/",
  CC0: "publicdomain/zero/1.0/",
} as const;

interface ReferencePhoto {
  line: Line;
  series: string;
  path: string;
  author: string;
  license: keyof typeof licenses;
}

const photos: ReferencePhoto[] = [
  { line: 1, series: "1000호대 VVVF", path: "5/57/Seoul_Metro_1006_approaching_Sindorim_Station.JPG", author: "Av3037", license: "CC BY 3.0" },
  { line: 2, series: "2000호대 4차분", path: "d/d3/Seoul_Metro_2000_(4th-gen),_Line_2,_Gangbyeon_(20250817).jpg", author: "Takeshi Aida", license: "CC BY-SA 4.0" },
  { line: 3, series: "3000호대 VVVF", path: "2/26/Seoul_Metro_Class_3000_(3045),_Line_3,_Daegok_(20240408)_(54219625837).jpg", author: "Takeshi Aida", license: "CC BY-SA 2.0" },
  { line: 4, series: "4000호대 VVVF", path: "4/48/Seoul_Metro_Class_4000_EMU_set_483_20230708_173811.jpg", author: "Striker9498", license: "CC BY-SA 3.0" },
  { line: 5, series: "5000호대", path: "8/85/Seoulmetro_5000_series_subway_train.jpg", author: "Myeongho jeong", license: "CC BY-SA 4.0" },
  { line: 6, series: "6000호대", path: "6/6f/운행종료_후_기지로_입고되는_서울도시철도_6호선_6000호대_621편성.JPG", author: "신헤림", license: "CC BY-SA 3.0" },
  { line: 7, series: "7000호대", path: "4/46/Seoul_Metro_7000-Series.jpg", author: "zheng2088", license: "CC0" },
  { line: 8, series: "8000호대", path: "1/10/Seoul_Metro_8000,_Line_8,_Nam-Wilye_(20240406)_(54220767709).jpg", author: "Takeshi Aida", license: "CC BY-SA 2.0" },
  { line: 9, series: "9000호대", path: "2/22/Metro_9_Class_9000_EMU.jpg", author: "Minseong Kim", license: "CC BY-SA 4.0" },
];

const modelNames = {
  1: "1000호대 VVVF",
  2: "2000호대 4차분",
  3: "3000호대 초퍼제어",
  4: "4000호대 3차분",
  5: "5000호대 1차분",
  6: "6000호대",
  7: "7000호대 1차분",
  8: "8000호대 1차분",
} satisfies Record<ModelLine, string>;

function photoLinks({ path }: ReferencePhoto) {
  const filename = encodeURIComponent(path.slice(5));
  return {
    image: `https://thumb.wikimedia.org/wikipedia/commons/thumb/${path.slice(0, 5)}${filename}/960px-${filename}`,
    original: `https://commons.wikimedia.org/wiki/File:${filename}`,
  };
}

function Photo({ photo, lazy = false }: { photo: ReferencePhoto; lazy?: boolean }) {
  const { image } = photoLinks(photo);
  return <img src={image} loading={lazy ? "lazy" : "eager"} decoding="async"
    alt={`${photo.line}호선 ${photo.series} 실차`} />;
}

function Credit({ photo }: { photo: ReferencePhoto }) {
  return <div className="stock-credit">
    <a href={photoLinks(photo).original} target="_blank" rel="noreferrer">사진 · {photo.author}</a>
    <a href={`https://creativecommons.org/${licenses[photo.license]}`} target="_blank" rel="noreferrer">{photo.license}</a>
  </div>;
}

const views = {
  "사선": new Vector3(24, 9, -23),
  "정면": new Vector3(0, 2.7, -17),
  "측면": new Vector3(35, 4.5, 0),
};
type View = keyof typeof views;
type ViewerStatus = "loading" | "ready" | "unavailable";

function disposeModel(model: Object3D) {
  const textures = new Set<Texture>();
  const materials = new Set<Material>();
  model.traverse(node => {
    if (!(node instanceof Mesh)) return;
    node.geometry.dispose();
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      materials.add(material);
      if (material instanceof MeshStandardMaterial && material.map) textures.add(material.map);
    }
  });
  for (const texture of textures) {
    if (typeof ImageBitmap !== "undefined" && texture.image instanceof ImageBitmap) texture.image.close();
    texture.dispose();
  }
  for (const material of materials) material.dispose();
}

const modelUrl = (line: ModelLine) => `${import.meta.env.BASE_URL}rolling-stock/line-${line}.glb`;

function mountViewer(surface: HTMLDivElement, setStatus: (status: ViewerStatus) => void) {
  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio));
  renderer.domElement.setAttribute("aria-hidden", "true");
  surface.append(renderer.domElement);
  const scene = new Scene();
  scene.background = new Color("#242d37");
  const camera = new PerspectiveCamera(36, 1, 0.1, 180);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.9, 0);
  controls.enablePan = false;
  controls.minDistance = 12;
  controls.maxDistance = 75;

  const key = new DirectionalLight("#fff3e1", 2.4);
  key.position.set(9, 16, -14);
  scene.add(key, new HemisphereLight("#dceaff", "#8c9bad", 2.4));
  const fill = new DirectionalLight("#c2dcff", 1.2);
  fill.position.set(-12, 7, 8);
  scene.add(fill);
  const loader = new GLTFLoader();
  let active: Object3D | undefined;
  let loadVersion = 0;
  const draw = () => renderer.render(scene, camera);
  const resize = () => {
    if (!surface.clientWidth || !surface.clientHeight) return;
    camera.aspect = surface.clientWidth / surface.clientHeight;
    camera.zoom = Math.min(1, camera.aspect / 1.35);
    camera.updateProjectionMatrix();
    renderer.setSize(surface.clientWidth, surface.clientHeight);
    draw();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(surface);
  controls.addEventListener("change", draw);

  function clear() {
    if (!active) return;
    scene.remove(active);
    disposeModel(active);
    active = undefined;
  }

  return {
    load(line: ModelLine) {
      const version = ++loadVersion;
      clear();
      setStatus("loading");
      draw();
      loader.load(modelUrl(line), ({ scene: model }) => {
        if (version !== loadVersion) {
          disposeModel(model);
          return;
        }
        const cab = model.getObjectByName("cab");
        if (!cab) {
          disposeModel(model);
          setStatus("unavailable");
          return;
        }
        // GLB는 선두와 중간차를 같은 원점에 두므로 비교 화면에는 선두차만 놓는다.
        const trailer = model.getObjectByName("trailer");
        if (trailer) trailer.visible = false;
        active = model;
        scene.add(model);
        setStatus("ready");
        draw();
      }, undefined, () => {
        if (version === loadVersion) setStatus("unavailable");
      });
    },
    selectView(view: View) {
      camera.position.copy(views[view]);
      controls.update();
      draw();
    },
    dispose() {
      loadVersion++;
      observer.disconnect();
      controls.dispose();
      clear();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}

function ModelViewer({ line }: { line: ModelLine }) {
  const surface = useRef<HTMLDivElement>(null);
  const viewer = useRef<ReturnType<typeof mountViewer> | null>(null);
  const [status, setStatus] = useState<ViewerStatus>("loading");
  useEffect(() => {
    if (!surface.current) return;
    try {
      viewer.current = mountViewer(surface.current, setStatus);
      viewer.current.selectView("사선");
    } catch {
      setStatus("unavailable");
    }
    return () => {
      viewer.current?.dispose();
      viewer.current = null;
    };
  }, []);
  useEffect(() => {
    viewer.current?.load(line);
  }, [line]);

  return <>
    <div ref={surface} className="stock-stage" role="img" aria-label={`${line}호선 ${modelNames[line]} 선두차 3D 모델`}
      data-model-status={status}>
      {status !== "ready" && <span role="status">{status === "loading" ? "3D 모델 불러오는 중" : "3D 모델을 표시할 수 없어요"}</span>}
    </div>
    <div className="stock-view-controls">
      <div role="group" aria-label="3D 보기 방향">
        {(Object.keys(views) as View[]).map(view => (
          <button key={view} disabled={status !== "ready"} onClick={() => viewer.current?.selectView(view)}>{view}</button>
        ))}
      </div>
      <a href={modelUrl(line)} download>GLB 파일</a>
    </div>
  </>;
}

function Gallery() {
  const [line, setLine] = useState<Line>(1);
  const comparison = useRef<HTMLElement>(null);
  const photo = photos[line - 1];
  return <main className="stock-gallery">
    <style>{galleryStyles}</style>
    <header className="stock-heading">
      <h1>서울 지하철 차량 비교</h1>
      <a href={`${import.meta.env.BASE_URL}rolling-stock/credits.txt`} target="_blank" rel="noreferrer">3D 에셋 출처</a>
    </header>
    <nav className="stock-nav" aria-label="호선 선택">
      {photos.map(item => <button key={item.line} type="button" aria-pressed={line === item.line}
        style={{ "--line-color": colors[item.line] } as CSSProperties}
        onClick={() => setLine(item.line)}>{item.line}호선</button>)}
    </nav>
    <section ref={comparison} className="stock-compare" aria-label={`${line}호선 사진과 모델`}>
      <article>
        <div className="stock-panel-title">
          <span>실차 사진</span><h2>{line}호선 {photo.series}</h2>
        </div>
        <div className="stock-featured-photo"><Photo photo={photo} /></div>
        <Credit photo={photo} />
      </article>
      <article>
        <div className="stock-panel-title">
          <span>3D 선두차</span><h2>{line === 9 ? "9000호대" : modelNames[line]}</h2>
        </div>
        {line === 9
          ? <div className="stock-stage"><span>9호선은 실차 사진만 확보했어요.</span></div>
          : <ModelViewer line={line} />}
        {line === 3 && <p className="stock-note">사진은 VVVF 차량이고, 현재 GLB는 퇴역한 초퍼형이에요.</p>}
      </article>
    </section>
    <section aria-labelledby="stock-grid-title">
      <h2 id="stock-grid-title">1–9호선 실차 사진</h2>
      <div className="stock-grid">
        {photos.map(item => <article key={item.line} style={{ "--line-color": colors[item.line] } as CSSProperties}>
          <button type="button" aria-pressed={item.line === line} onClick={() => {
            setLine(item.line);
            comparison.current?.scrollIntoView({ block: "start" });
          }}>
            <Photo photo={item} lazy />
            <span><b>{item.line}호선</b> {item.series}</span>
          </button>
          <Credit photo={item} />
        </article>)}
      </div>
    </section>
  </main>;
}

export const AllLines: StoryObj = {
  name: "실차 사진과 3D 에셋",
  render: () => <Gallery />,
};

const galleryStyles = `
  .stock-gallery, .stock-gallery * { box-sizing: border-box; }
  .stock-gallery { min-height: 100vh; background: #11171d; color: #f1f2ef; padding: clamp(16px, 4vw, 48px);
    font-family: system-ui, "Apple SD Gothic Neo", sans-serif; }
  .stock-gallery > * { max-width: 1180px; margin-inline: auto; }
  .stock-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .stock-heading h1 { margin: 0; font-size: clamp(23px, 3.5vw, 42px); font-weight: 720; letter-spacing: -.045em; }
  .stock-gallery h2 { margin: 0; font-size: 17px; letter-spacing: -.02em; }
  .stock-gallery a { color: #c3d5df; font-size: 12px; text-underline-offset: 3px; }
  .stock-gallery button { background: #1b252e; color: inherit; font: inherit; border: 1px solid #3b4854;
    cursor: pointer; border-radius: 7px; }
  .stock-gallery button:focus-visible, .stock-gallery a:focus-visible { outline: 2px solid #e3f2ff; outline-offset: 3px; }
  .stock-gallery button:disabled { opacity: .5; cursor: default; }
  .stock-nav { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 20px; margin-bottom: 16px; }
  .stock-nav button { padding: 7px 11px; font-size: 13px; box-shadow: inset 0 -2px var(--line-color); }
  .stock-nav button[aria-pressed=true] { background: #374756; border-color: #b5c6d0; }
  .stock-compare { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 30px; }
  .stock-compare article, .stock-grid article { min-width: 0; background: #192128; border: 1px solid #33414c; border-radius: 10px; overflow: hidden; }
  .stock-panel-title { padding: 13px 14px 10px; }
  .stock-panel-title span { color: #afbdc7; font-size: 12px; }
  .stock-panel-title h2 { margin-top: 3px; }
  .stock-featured-photo, .stock-stage { width: 100%; aspect-ratio: 16 / 10; background: #242d37; }
  .stock-stage { position: relative; display: grid; place-items: center; overflow: hidden; }
  .stock-stage canvas { position: absolute; inset: 0; }
  .stock-stage span { position: relative; z-index: 1; font-size: 13px; color: #d4dee7; }
  .stock-gallery img { width: 100%; height: 100%; display: block; object-fit: contain; }
  .stock-view-controls { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; padding: 8px 12px; }
  .stock-view-controls div { display: flex; gap: 5px; }
  .stock-view-controls button { padding: 4px 8px; font-size: 12px; }
  .stock-note { margin: 0; padding: 0 12px 9px; color: #e9cc9d; font-size: 12px; }
  .stock-credit { padding: 8px 12px; display: flex; gap: 8px; flex-wrap: wrap; }
  .stock-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 12px; }
  .stock-grid button { display: block; width: 100%; padding: 0; border: 0; border-radius: 0;
    background: transparent; text-align: left; }
  .stock-grid button img { height: auto; aspect-ratio: 16 / 10; background: #242d37; }
  .stock-grid button span { display: block; padding: 8px 12px 1px; font-size: 13px; }
  .stock-grid button b { margin-right: 4px; }
  .stock-grid article:has([aria-pressed=true]) { border-color: var(--line-color); }
  @media(max-width: 680px) {
    .stock-compare { grid-template-columns: 1fr; }
    .stock-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
  }
`;
