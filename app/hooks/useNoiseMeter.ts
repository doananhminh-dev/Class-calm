"use client";

import { useRef, useState } from "react";

let sharedAudioContext: AudioContext | null = null;
let sharedAnalyser: AnalyserNode | null = null;
let sharedRAF: number | null = null;

export function useNoiseMeter() {
  const [db, setDb] = useState(0);
  const [started, setStarted] = useState(false);

  const dataArrayRef = useRef<Float32Array | null>(null);

  const start = async () => {
    if (started) return;
    setStarted(true);

    // ===== TẠO AUDIO CONTEXT CHỈ 1 LẦN =====
    if (!sharedAudioContext) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      sharedAudioContext = new AudioContext();
      await sharedAudioContext.resume();

      sharedAnalyser = sharedAudioContext.createAnalyser();
      sharedAnalyser.fftSize = 2048;

      const source =
        sharedAudioContext.createMediaStreamSource(stream);
      source.connect(sharedAnalyser);

      dataArrayRef.current = new Float32Array(sharedAnalyser.fftSize);
    }

    let smoothDb = 0;

    const SMOOTHING = 0.35; // NHẠY HƠN
    const NOISE_GATE = 6;

    const update = () => {
      if (!sharedAnalyser || !dataArrayRef.current) return;

      sharedAnalyser.getFloatTimeDomainData(dataArrayRef.current);

      let sum = 0;
      for (let i = 0; i < dataArrayRef.current.length; i++) {
        const v = dataArrayRef.current[i];
        sum += v * v;
      }

      const rms = Math.sqrt(sum / dataArrayRef.current.length);

      const rawDb = Math.min(100, Math.max(0, rms * 120));
      const gatedDb = rawDb < NOISE_GATE ? 0 : rawDb;

      smoothDb += (gatedDb - smoothDb) * SMOOTHING;

      setDb(Math.round(smoothDb));

      sharedRAF = requestAnimationFrame(update);
    };

    update();
  };

  return {
    db,
    start,
    started,
  };
}
