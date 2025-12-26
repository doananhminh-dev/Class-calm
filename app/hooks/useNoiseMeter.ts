"use client";

import { useRef, useState } from "react";

export function useNoiseMeter(limit: number) {
  const [db, setDb] = useState(0);
  const [started, setStarted] = useState(false);
  const [alerting, setAlerting] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const rafRef = useRef<number | null>(null);

  // ===== REALTIME STATE (KHÔNG PEAK) =====
  const smoothDbRef = useRef(0);
  const lastLimitRef = useRef(limit);

  const start = async () => {
    if (started) return;
    setStarted(true);

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const audioContext = new AudioContext();
    await audioContext.resume();
    audioContextRef.current = audioContext;

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyserRef.current = analyser;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    dataArrayRef.current = new Uint8Array(analyser.fftSize);

    const SMOOTHING = 0.2;   // NHẠY HƠN
    const NOISE_GATE = 6;   // chặn noise nền

    const update = () => {
      if (!analyserRef.current || !dataArrayRef.current) return;

      analyserRef.current.getByteTimeDomainData(dataArrayRef.current);

      let sum = 0;
      for (let i = 0; i < dataArrayRef.current.length; i++) {
        const v = (dataArrayRef.current[i] - 128) / 128;
        sum += v * v;
      }

      const rms = Math.sqrt(sum / dataArrayRef.current.length);

      // ===== dB REALTIME (NHẠY) =====
      let rawDb = Math.min(100, rms * 140);
      if (rawDb < NOISE_GATE) rawDb = 0;

      // ===== SMOOTH NHẸ =====
      smoothDbRef.current +=
        (rawDb - smoothDbRef.current) * SMOOTHING;

      const realtimeDb = Math.round(smoothDbRef.current);

      // ===== FIX LỖI ĐỔI LIMIT =====
      if (limit !== lastLimitRef.current) {
        smoothDbRef.current = 0;
        setDb(0);
        setAlerting(false);
        lastLimitRef.current = limit;
        rafRef.current = requestAnimationFrame(update);
        return;
      }

      // ===== ALERT THEO REALTIME =====
      setAlerting(realtimeDb >= limit);

      // ===== UI =====
      setDb(realtimeDb);

      rafRef.current = requestAnimationFrame(update);
    };

    update();
  };

  return {
    db,         // db realtime hiển thị
    alerting,   // dùng để bật màu đỏ
    start,
    started,
  };
}
