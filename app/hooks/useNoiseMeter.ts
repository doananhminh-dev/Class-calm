"use client";

import { useRef, useState } from "react";

export function useNoiseMeter(dbLimit: number = 60) {
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

    // ===== GIỮ LOGIC CŨ, BỎ PEAK =====
    let smoothDb = 0;

    const SMOOTHING = 0.1;      // mượt ~0.5s
    const NOISE_GATE = 4;       // CHẶN NHIỄU NỀN (RẤT QUAN TRỌNG)
    const VIBRATE_COOLDOWN = 1000;

    let lastVibrate = 0;

    const update = () => {
      analyser.getByteTimeDomainData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const v = (dataArray[i] - 128) / 128;
        sum += v * v;
      }

      const rms = Math.sqrt(sum / dataArray.length);

      // ===== dB gốc =====
      const rawDb = Math.min(100, Math.max(0, rms * 120));

      // ===== NOISE GATE =====
      const gatedDb = rawDb < NOISE_GATE ? 0 : rawDb;

      // ===== SMOOTH =====
      smoothDb = smoothDb + (gatedDb - smoothDb) * SMOOTHING;

      // ===== RUNG: CHỈ KHI > LIMIT =====
      const now = Date.now();
      if (
        smoothDb >= dbLimit &&
        navigator.vibrate &&
        now - lastVibrate > VIBRATE_COOLDOWN
      ) {
        navigator.vibrate(200);
        lastVibrate = now;
      }

      // ===== GỬI RA UI =====
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
