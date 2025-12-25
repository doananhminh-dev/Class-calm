"use client";

import { useRef, useState } from "react";

export function useNoiseMeter() {
  const [db, setDb] = useState(0);
  const [started, setStarted] = useState(false);
  const [alerting, setAlerting] = useState(false);

  const rafRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // ✅ dùng ref cho realtime logic
  const alertingRef = useRef(false);
  const alertTimeoutRef = useRef<any>(null);
  const lastAlertTimeRef = useRef(0);

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

    const SMOOTHING = 0.12;
    const VIBRATE_LIMIT = 60;
    const NOISE_GATE = 8;

    const ALERT_DURATION = 2000;
    const COOLDOWN = 3000;

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

      const now = Date.now();
      const aboveLimit = smoothDb >= VIBRATE_LIMIT + 2; // ✅ biên an toàn

      // ===== LOGIC BÁO (ĐÃ FIX) =====
      if (
        aboveLimit &&
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
