"use client";

import { useRef, useState } from "react";

export function useNoiseMeter() {
  const [db, setDb] = useState(0);
  const [started, setStarted] = useState(false);

  const rafRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const start = async () => {
    if (started) return;
    setStarted(true);

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const audioContext = new AudioContext();
    await audioContext.resume();
    audioContextRef.current = audioContext;

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.fftSize);

    // ===== GIỮ SMOOTH =====
    let smoothDb = 0;

    const SMOOTHING = 0.1;      // mượt ~0.5s
    const VIBRATE_LIMIT = 80;  // ngưỡng rung
    const NOISE_GATE = 3;      // chặn nhiễu mic

    let lastVibrate = 0;

    const update = () => {
      analyser.getByteTimeDomainData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const v = (dataArray[i] - 128) / 128;
        sum += v * v;
      }

      const rms = Math.sqrt(sum / dataArray.length);

      // ===== dB đo thật =====
      let rawDb = Math.min(100, Math.max(0, rms * 120));

      // ===== NOISE GATE =====
      if (rawDb < NOISE_GATE) rawDb = 0;

      // ===== SMOOTH =====
      smoothDb = smoothDb + (rawDb - smoothDb) * SMOOTHING;

      // ===== RUNG (CHỈ THEO smoothDb) =====
      const now = Date.now();
      if (
        smoothDb >= VIBRATE_LIMIT &&
        navigator.vibrate &&
        now - lastVibrate > 1000
      ) {
        navigator.vibrate(200);
        lastVibrate = now;
      }

      // ===== HIỂN THỊ =====
      setDb(Math.round(smoothDb));

      rafRef.current = requestAnimationFrame(update);
    };

    update();
  };

  return {
    db,
    start,
    started,
  };
}
