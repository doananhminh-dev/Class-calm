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

    // ===== MIC =====
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    // ===== AUDIO CONTEXT (FIX MOBILE) =====
    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;

    if (audioContext.state !== "running") {
      await audioContext.resume();
    }

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.fftSize);

    // ===== CONFIG (TUNE CHO MOBILE) =====
    let smoothDb = 0;

    const NOISE_FLOOR = 0.0006;   // rất quan trọng cho điện thoại
    const DB_SCALE = 220;         // tăng độ nhạy
    const SMOOTHING = 0.28;       // mượt nhưng không ăn mất tín hiệu

    const VIBRATE_LIMIT = 60;

    const ALERT_DURATION = 2000;  // rung 2s
    const COOLDOWN = 3000;        // 3s mới rung lại

    let lastAlertTime = 0;
    let alertTimeout: any = null;

    const update = () => {
      analyser.getByteTimeDomainData(dataArray);

      // ===== RMS =====
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const v = (dataArray[i] - 128) / 128;
        sum += v * v;
      }

      const rms = Math.sqrt(sum / dataArray.length);

      // ===== REALTIME DB (KHÔNG PEAK) =====
      const effectiveRms = Math.max(0, rms - NOISE_FLOOR);

      const realtimeDb = Math.min(
        100,
        Math.max(0, effectiveRms * DB_SCALE)
      );

      // ===== SMOOTH NHẸ =====
      smoothDb += (realtimeDb - smoothDb) * SMOOTHING;

      const now = Date.now();
      const aboveLimit = smoothDb >= VIBRATE_LIMIT;

      // ===== RUNG: CHỈ DỰA REALTIME =====
      if (
        aboveLimit &&
        !alerting &&
        now - lastAlertTime >= COOLDOWN
      ) {
        setAlerting(true);
        lastAlertTime = now;

        if (navigator.vibrate) {
          navigator.vibrate(2000); // rung đúng 2s
        }

        alertTimeout = setTimeout(() => {
          setAlerting(false);
        }, ALERT_DURATION);
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
