"use client";

import { useRef, useState } from "react";

export function useNoiseMeter() {
  const [db, setDb] = useState(0);
  const [started, setStarted] = useState(false);
  const [alerting, setAlerting] = useState(false);

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

    // ===== REALTIME DB =====
    let smoothDb = 0;

    // ===== TINH CHỈNH =====
    const SMOOTHING = 0.18;        // nhạy hơn hôm qua
    const NOISE_FLOOR = 0.003;    // im lặng thật
    const DB_SCALE = 160;         // tăng mạnh hơn

    const LIMIT = 60;

    const VIBRATE_TIME = 2000;    // rung 2s
    const COOLDOWN = 3000;        // nghỉ 3s

    let lastVibrate = 0;

    const update = () => {
      analyser.getByteTimeDomainData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const v = (dataArray[i] - 128) / 128;
        sum += v * v;
      }

      const rms = Math.sqrt(sum / dataArray.length);

      // ===== NOISE FLOOR THỰC =====
      const effectiveRms = Math.max(0, rms - NOISE_FLOOR);

      // ===== DB REALTIME (DUY NHẤT) =====
      const realtimeDb = Math.min(
        100,
        Math.max(0, effectiveRms * DB_SCALE)
      );

      // ===== SMOOTH =====
      smoothDb += (realtimeDb - smoothDb) * SMOOTHING;

      const now = Date.now();
      const aboveLimit = smoothDb >= LIMIT;

      // ===== RUNG NGAY KHI VƯỢT =====
      if (
        aboveLimit &&
        !alerting &&
        now - lastVibrate >= COOLDOWN
      ) {
        setAlerting(true);
        lastVibrate = now;

        navigator.vibrate?.([300, 100, 300, 100, 300]);

        setTimeout(() => {
          setAlerting(false);
        }, VIBRATE_TIME);
      }

      // ===== UI =====
      setDb(Math.round(smoothDb));

      rafRef.current = requestAnimationFrame(update);
    };

    update();
  };

  return {
    db,
    start,
    started,
    alerting,
  };
}
