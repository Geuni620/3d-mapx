# /// script
# requires-python = ">=3.10"
# dependencies = ["fonttools>=4.50,<5"]
# ///
import argparse
import json
import shutil
import subprocess
import tempfile
from fractions import Fraction
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

REFERENCE = Path(__file__).resolve().parents[2] / "docs/dangsan-window/week-ending-v2"
AAC_HASH = "SHA256=f006f015f1e7bc4d5dbdd402e5926fe89f03c65e3c928c754661c7bbc6983097"


def run(opts, cwd=None):
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-n", *map(str, opts)], check=True, cwd=cwd)


def audio_id(path):
    return subprocess.check_output(
        ["ffmpeg", "-v", "error", "-i", path, "-map", "0:a:0", "-c:a", "copy", "-f", "hash", "-"],
        text=True,
    ).strip()


def probe(path):
    return json.loads(subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_streams", "-of", "json", path]
    ))


def pts(path):
    result = subprocess.check_output(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "packet=pts", "-of", "json", path]
    )
    return sorted(int(packet["pts"]) for packet in json.loads(result)["packets"])


def finish(args):
    work = args.work_dir.resolve(strict=True)
    parent = args.audio_from.resolve(strict=True)
    font_path = args.font.resolve(strict=True)
    stage = args.output.resolve()
    times = json.loads((work / "timing.json").read_text())["times"]
    if times != [round(i * 1_000_000 / 60) for i in range(1620)]:
        raise ValueError("촬영 타임스탬프가 승인본 규격과 다릅니다.")
    if audio_id(parent) != AAC_HASH:
        raise ValueError("승인받은 방송·주행음 AAC 트랙이 필요합니다.")
    take = (work / "take.h264").resolve(strict=True)
    stage.mkdir(parents=True, exist_ok=False)
    movie = stage / "week-ending-v2.mp4"
    with tempfile.TemporaryDirectory() as temp:
        card_dir = Path(temp)
        name = '합성 음성   ·   © OpenMapTiles   ·   © OpenStreetMap contributors'
        url = 'openstreetmap.org/copyright'
        (card_dir / 'card.txt').write_text(name, encoding='utf-8')
        (card_dir / 'card-url.txt').write_text(url, encoding='utf-8')
        font = TTFont(font_path)
        chars = subset.Subsetter()
        chars.populate(text=name + url)
        chars.subset(font)
        instantiateVariableFont(font, {'wght': 470}, inplace=True)
        font.save(card_dir / 'card.ttf')
        graph = (
            '[0:v]trim=end_frame=1544,setpts=PTS-STARTPTS,fade=t=out:s=1529:n=14[view];'
            'color=c=black:s=1920x1080:r=60,trim=end_frame=76,setpts=PTS-STARTPTS,'
            'drawtext=fontfile=card.ttf:textfile=card.txt:fontsize=32:fontcolor=0xD7D8D9:x=(w-tw)/2:y=(h-th)/2-18,'
            'drawtext=fontfile=card.ttf:textfile=card-url.txt:fontsize=25:fontcolor=0xA8AAAC:x=(w-tw)/2:y=(h-th)/2+25[credits];'
            '[view][credits]concat=n=2:v=1:a=0,format=yuv420p[v]'
        )
        comment='Passenger window of scheduled Seoul Line 2 train 2280. Independent Three.js sunset visualization, with illustrative steel bracing, interior and foliage. Audio copied from week-ending.mp4; locally synthesized Korean narration (Supertonic 3 M4), synthetic rail ambience. Map data © OpenStreetMap contributors, https://www.openstreetmap.org/copyright ; © OpenMapTiles via OpenFreeMap. Mapzen Terrain Tiles. Seoul Metro timetable. Noto Sans KR (OFL 1.1).'
        run(['-fflags','+genpts','-r','60','-f','h264','-i',take,'-i',parent,
             '-filter_complex_threads','3','-filter_complex',graph,'-map','[v]','-map','1:a:0',
             '-map_metadata','1','-map_metadata:s:a:0','1:s:a:0','-c:v','libx264','-preset','veryfast',
             '-crf','15','-profile:v','high','-level:v','4.2','-threads','4','-r','60',
             '-colorspace','bt709','-color_primaries','bt709','-color_trc','iec61966-2-1','-color_range','tv',
             '-video_track_timescale','60000','-c:a','copy','-metadata','title=당산철교의 퇴근길 · 차창 너머',
             '-metadata','comment='+comment,'-movflags','+faststart',movie], cwd=card_dir)
    metadata = probe(movie)
    v, a = metadata["streams"]
    video_spec = (v["width"], v["height"], v["avg_frame_rate"], v["nb_frames"], v["duration"])
    if video_spec != (1920, 1080, "60/1", "1620", "27.000000"):
        raise ValueError(metadata)
    if a['duration'] != '27.000000' or audio_id(movie) != AAC_HASH:
        raise ValueError("AAC 검증 실패")
    if [t * Fraction(v['time_base']) for t in pts(movie)] != [Fraction(i,60) for i in range(1620)]:
        raise ValueError("프레임 표시 시각 검증 실패")
    lines = subprocess.check_output(
        ["ffmpeg", "-v", "error", "-xerror", "-i", movie, "-map", "0:v",
         "-vf", "scale=240:135:flags=area,format=gray", "-f", "framemd5", "-"],
        text=True,
    ).splitlines()
    hashes = [line.rsplit(",", 1)[-1].strip() for line in lines if not line.startswith("#")]
    if len(hashes) != 1620 or len(set(hashes[:1529])) != 1529:
        raise ValueError("디코드 프레임 수 또는 페이드 전 프레임 중복 검증 실패")
    for frame,label in [(0,'01-truss'),(986,'02-sunset'),(1404,'03-river')]:
        run(['-i',movie,'-vf',f'select=eq(n\\,{frame}),format=rgb24','-frames:v','1',stage/f'week-ending-v2-{label}.png'])
    shutil.copyfile(REFERENCE / "week-ending-v2-credits.txt", stage / "week-ending-v2-credits.txt")
    print(movie, len(hashes), "frames", audio_id(movie))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="촬영한 H.264에 방송과 엔딩 크레디트를 결합")
    parser.add_argument("--work-dir", required=True, type=Path, help="capture.py가 만든 디렉터리")
    parser.add_argument("--font", required=True, type=Path, help="Noto Sans KR 가변 TTF")
    parser.add_argument("--audio-from", type=Path, default=REFERENCE / "week-ending-v2.mp4",
                        help="원본 week-ending.mp4 또는 동일 AAC를 담은 승인 영상")
    parser.add_argument("--output", type=Path, required=True, help="새로 만들 결과 디렉터리")
    finish(parser.parse_args())
