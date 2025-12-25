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

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;
    if (audioContext.state !== "running") await audioContext.resume();

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.fftSize);

    // ===== CONFIG =====
    let smoothDb = 0;
    let lastDb = 0;

    let armed = false; // 🔥 CHỐNG RUNG BẬY KHI ĐỔI LIMIT

    const NOISE_FLOOR = 0.0006;
    const DB_SCALE = 220;
    const SMOOTHING = 0.28;

    const VIBRATE_LIMIT = 60;
    const HYSTERESIS = 5; // db phải tụt thấp hơn limit ít nhất 5db

    const ALERT_DURATION = 2000;
    const COOLDOWN = 3000;

    let lastAlertTime = 0;
    let alertTimeout: any = null;

    const update = () => {
      analyser.getByteTimeDomainData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const v = (dataArray[i] - 128) / 128;
        sum += v * v;
      }

      const rms = Math.sqrt(sum / dataArray.length);
      const effectiveRms = Math.max(0, rms - NOISE_FLOOR);

      const realtimeDb = Math.min(
        100,
        Math.max(0, effectiveRms * DB_SCALE)
      );

      smoothDb += (realtimeDb - smoothDb) * SMOOTHING;

      const now = Date.now();

      // ===== ARMING LOGIC =====
      if (smoothDb < VIBRATE_LIMIT - HYSTERESIS) {
        armed = true;
      }

      const crossedUp =
        armed &&
        lastDb < VIBRATE_LIMIT &&
        smoothDb >= VIBRATE_LIMIT &&
        smoothDb > lastDb;

      if (
        crossedUp &&
        !alerting &&
        now - lastAlertTime >= COOLDOWN
      ) {
        setAlerting(true);
        lastAlertTime = now;
        armed = false; // phải tụt xuống lại mới rung tiếp

        if (navigator.vibrate) {
          navigator.vibrate(2000);
        }

        alertTimeout = setTimeout(() => {
          setAlerting(false);
        }, ALERT_DURATION);
      }

      lastDb = smoothDb;
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
