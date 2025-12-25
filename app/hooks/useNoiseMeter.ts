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

    // ===== REALTIME =====
    let smoothDb = 0;

    const SMOOTHING = 0.12;      // mượt hơn, không giật
    const VIBRATE_LIMIT = 60;   // giữ nguyên
    const NOISE_GATE = 8;

    const ALERT_DURATION = 2000; // báo 2s
    const COOLDOWN = 3000;       // 3s báo lại nếu vẫn vượt

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

      // ===== dB realtime (nhạy hơn) =====
      const rawDb = Math.min(100, Math.max(0, rms * 110));
      const gatedDb = rawDb < NOISE_GATE ? 0 : rawDb;

      // ===== SMOOTH =====
      smoothDb += (gatedDb - smoothDb) * SMOOTHING;

      const now = Date.now();
      const aboveLimit = smoothDb >= VIBRATE_LIMIT;

      // ===== LOGIC BÁO + COOLDOWN =====
      if (
        aboveLimit &&
        !alerting &&
        now - lastAlertTime >= COOLDOWN
      ) {
        setAlerting(true);
        lastAlertTime = now;

        if (navigator.vibrate) {
          navigator.vibrate([200, 100, 200]);
        }

        alertTimeout = setTimeout(() => {
          setAlerting(false);
        }, ALERT_DURATION);
      }

      // ===== UI REALTIME =====
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
