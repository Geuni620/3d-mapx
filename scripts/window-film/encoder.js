const fps = 60;
const timestamp = frame => Math.round(frame * 1_000_000 / fps);

export async function createEncoder({ shot, drawFilm }) {
  const config = {
    codec: "avc1.64002a", width: 1920, height: 1080, bitrate: 38_000_000,
    framerate: fps, latencyMode: "realtime", avc: { format: "annexb" },
  };
  if (!window.VideoEncoder || !(await VideoEncoder.isConfigSupported(config)).supported) {
    throw new Error("이 브라우저에서는 WebCodecs H.264 High 인코더를 쓸 수 없습니다.");
  }
  const chunks = [];
  const timestamps = [];
  let failure;
  const encoder = new VideoEncoder({
    output(chunk) {
      const bytes = new Uint8Array(chunk.byteLength);
      chunk.copyTo(bytes);
      chunks.push(bytes);
      timestamps.push(chunk.timestamp);
    },
    error(error) { failure = error; },
  });
  encoder.configure(config);
  let previousCamera;
  return {
    async batch(start, count) {
      let maxMove = 0;
      for (let n = start; n < start + count; n++) {
        if (drawFilm(n).visible !== 1) throw new Error(`프레임 ${n}에서 열차가 없습니다.`);
        if (previousCamera) maxMove = Math.max(maxMove, shot.camera.position.distanceTo(previousCamera));
        previousCamera = shot.camera.position.clone();
        const frame = new VideoFrame(shot.canvas, {
          timestamp: timestamp(n), duration: timestamp(n + 1) - timestamp(n),
        });
        try {
          encoder.encode(frame, { keyFrame: n % 120 === 0 });
        } finally {
          frame.close();
        }
        if (encoder.encodeQueueSize >= 8) await encoder.flush();
        if (failure) throw failure;
      }
      await encoder.flush();
      if (failure) throw failure;
      let binary = "";
      for (const bytes of chunks) {
        for (let k = 0; k < bytes.length; k += 16384) {
          binary += String.fromCharCode(...bytes.subarray(k, k + 16384));
        }
      }
      chunks.length = 0;
      return { bytes: btoa(binary), times: timestamps.splice(0), maxMove };
    },
    close() {
      encoder.close();
      if (shot.renderer.getContext().isContextLost()) throw new Error("WebGL 컨텍스트가 종료됐습니다.");
    },
  };
}
