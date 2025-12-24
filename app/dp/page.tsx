"use client";

import { useNoiseMeter } from "@/app/hooks/useNoiseMeter";

export default function DBPage() {
  const { db, start, started } = useNoiseMeter();
  const limit = 60;

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Noise Monitor</h1>

      {!started && (
        <button
          onClick={start}
          className="px-4 py-2 bg-purple-600 text-white rounded"
        >
          🎤 Bắt đầu đo tiếng ồn
        </button>
      )}

      {started && (
        <>
          <div className="text-6xl font-mono">{db} dB</div>

          <div
            className={`h-4 rounded ${
              db > limit ? "bg-red-500" : "bg-green-500"
            }`}
            style={{ width: `${db}%` }}
          />

          <p>
            Giới hạn: <b>{limit} dB</b>
          </p>
        </>
      )}
    </div>
  );
}
