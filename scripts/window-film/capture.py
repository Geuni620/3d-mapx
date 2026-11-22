# /// script
# requires-python = ">=3.10"
# dependencies = ["playwright==1.58.0"]
# ///
import argparse
import base64
import json
from pathlib import Path

from playwright.sync_api import sync_playwright


def capture(args):
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="chrome", headless=True, args=["--enable-gpu"])
        page = browser.new_page(viewport={"width": 1920, "height": 1080}, device_scale_factor=1)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("console", lambda msg: errors.append(f"{msg.text} {msg.location['url']}") if msg.type == "error" else None)
        page.goto(f"http://127.0.0.1:{args.port}/scripts/window-film/index.html")
        page.wait_for_function("window.filmReady !== undefined")
        scene = page.evaluate("""async () => {
            const film = await window.filmReady;
            window.film = film;
            return { train: film.train, car: film.car, width: film.shot.canvas.width, height: film.shot.canvas.height };
        }""")
        print(scene, flush=True)
        if args.check:
            for frame in [0, 986, 1404]:
                state = page.evaluate("""n => {
                    const state = film.drawFilm(n);
                    const gl = film.shot.renderer.getContext();
                    return {...state, contextLost: gl.isContextLost()};
                }""", frame)
                if state["visible"] != 1 or state["contextLost"]:
                    raise RuntimeError(f"프레임 {frame} 검증 실패: {state}")
                print(frame, state, flush=True)
        else:
            page.evaluate("""async () => {
                const {createEncoder} = await import('/scripts/window-film/encoder.js');
                window.encoder = await createEncoder(window.film);
            }""")
            args.work_dir.mkdir(parents=True, exist_ok=False)
            times = []
            max_move = 0
            with (args.work_dir / "take.h264").open("xb") as take:
                for start in range(0, 1620, 30):
                    batch = page.evaluate("start => encoder.batch(start, 30)", start)
                    take.write(base64.b64decode(batch["bytes"], validate=True))
                    times.extend(batch["times"])
                    max_move = max(max_move, batch["maxMove"])
            page.evaluate("encoder.close()")
            if times != [round(i * 1_000_000 / 60) for i in range(1620)]:
                raise RuntimeError("캡처 타임스탬프가 60 fps와 다릅니다.")
        if errors:
            raise RuntimeError("\n".join(errors))
        if args.work_dir:
            (args.work_dir / "timing.json").write_text(json.dumps({"times": times, "maxMove": max_move}))
        browser.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="당산철교 v2 차창 장면의 헤드리스 촬영")
    parser.add_argument("--port", type=int, default=5173, help="로컬 Vite 서버 포트")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true", help="대표 프레임 세 장을 메모리에서 확인")
    mode.add_argument("--work-dir", type=Path, help="새로 만들 촬영 디렉터리")
    capture(parser.parse_args())
