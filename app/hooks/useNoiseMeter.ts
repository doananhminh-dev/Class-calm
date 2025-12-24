"use client";

import { useRef, useState } from "react";

export function useNoiseMeter() {
  const [db, setDb] = useState(0);
  const [started, setStarted] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  // ===== CẤU HÌNH =====
  const NOISE_GATE = 8;        // dưới mức này coi như im lặng
  const SMOOTHING = 0.1;       // mượt
  const VIBRATE_LIMIT = 60;    // ngưỡng rung
  const HOLD_TIME = 2000;      // phải vượt 2s mới rung

  let smoothDb = 0;
  let overLimitSince: number | null = null;
  let lastVibrate = 0;

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

    const update = () => {
      analyser.getByteTimeDomainData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const v = (dataArray[i] - 128) / 128;
        sum += v * v;
      }

      const rms = Math.sqrt(sum / dataArray.length);
      let rawDb = Math.min(100, rms * 120);

      // ===== NOISE GATE =====
      if (rawDb < NOISE_GATE) rawDb = 0;

      // ===== SMOOTH =====
      smoothDb = smoothDb + (rawDb - smoothDb) * SMOOTHING;

      const now = Date.now();

      // ===== LOGIC RUNG =====
      if (smoothDb >= VIBRATE_LIMIT) {
        if (overLimitSince === null) {
          overLimitSince = now;
        }

        if (
          now - overLimitSince >= HOLD_TIME &&
          navigator.vibrate &&
          now - lastVibrate > HOLD_TIME
        ) {
          navigator.vibrate(200);
          lastVibrate = now;
        }
      } else {
        // tụt xuống dưới ngưỡng → reset
        overLimitSince = null;
      }

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
