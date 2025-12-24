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

    // ===== GIỮ NGUYÊN LOGIC CỦA BẠN =====
    let smoothDb = 0;
    let peakDb = 0;

    const SMOOTHING = 0.1;     // ~0.5s
    const PEAK_FALL = 0.4;
    const VIBRATE_LIMIT = 80;

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

  // ===== NOISE GATE (QUAN TRỌNG) =====
  const NOISE_GATE = 2.5;
  const gatedDb = rawDb < NOISE_GATE ? 0 : rawDb;

  // ===== SMOOTHING =====
  smoothDb = smoothDb + (gatedDb - smoothDb) * SMOOTHING;

  // ===== PEAK HOLD (CHỈ ĐỂ HIỂN THỊ) =====
  if (smoothDb > peakDb) {
    peakDb = smoothDb;
  } else {
    peakDb -= PEAK_FALL;
    if (peakDb < smoothDb) peakDb = smoothDb;
    if (peakDb < 0) peakDb = 0;
  }

  // ===== RUNG: CHỈ DÙNG smoothDb =====
  const now = Date.now();
  if (
    smoothDb >= VIBRATE_LIMIT &&
    navigator.vibrate &&
    now - lastVibrate > 1000
  ) {
    navigator.vibrate(200);
    lastVibrate = now;
  }

  // ===== GỬI RA UI =====
  setDb(Math.round(smoothDb));

  requestAnimationFrame(update);
};

  return {
    db,
    start,
    started,
  };
}
