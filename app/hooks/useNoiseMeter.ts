"use client";

import { useRef, useState } from "react";

export function useNoiseMeter() {
  const [db, setDb] = useState(0);
  const [started, setStarted] = useState(false);
  const [alerting, setAlerting] = useState(false);

  const rafRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const alertingRef = useRef(false);
  const alertTimeoutRef = useRef<any>(null);
  const lastAlertTimeRef = useRef(0);

  // ✅ NEW: theo dõi thời gian vượt ngưỡng
  const overLimitSinceRef = useRef<number | null>(null);

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

    let smoothDb = 0;

    const SMOOTHING = 0.12;
    const VIBRATE_LIMIT = 60;
    const NOISE_GATE = 8;

    const ALERT_DURATION = 2000;
    const COOLDOWN = 3000;

    const REQUIRED_OVER_MS = 800; // ✅ phải vượt ≥ 0.8s mới rung

    const update = () => {
      analyser.getByteTimeDomainData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const v = (dataArray[i] - 128) / 128;
        sum += v * v;
      }

      const rms = Math.sqrt(sum / dataArray.length);
      const rawDb = Math.min(100, Math.max(0, rms * 110));
      const gatedDb = rawDb < NOISE_GATE ? 0 : rawDb;

      smoothDb += (gatedDb - smoothDb) * SMOOTHING;
      setDb(Math.round(smoothDb));

      const now = Date.now();
      const aboveLimit = smoothDb >= VIBRATE_LIMIT + 2;

      // ===== SUSTAIN LOGIC =====
      if (aboveLimit) {
        if (overLimitSinceRef.current === null) {
          overLimitSinceRef.current = now;
        }
      } else {
        overLimitSinceRef.current = null;
      }

      const sustained =
        overLimitSinceRef.current !== null &&
        now - overLimitSinceRef.current >= REQUIRED_OVER_MS;

      // ===== ALERT =====
      if (
        sustained &&
        !alertingRef.current &&
        now - lastAlertTimeRef.current >= COOLDOWN
      ) {
        alertingRef.current = true;
        setAlerting(true);
        lastAlertTimeRef.current = now;

        if (navigator.vibrate) {
          navigator.vibrate([200, 100, 200]);
        }

        if (alertTimeoutRef.current) {
          clearTimeout(alertTimeoutRef.current);
        }

        alertTimeoutRef.current = setTimeout(() => {
          alertingRef.current = false;
          setAlerting(false);
        }, ALERT_DURATION);
      }

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
