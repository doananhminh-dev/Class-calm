"use client"

import { useEffect, useRef, useState } from "react"

interface Props {
  currentDb: number
  dbLimit: number
  setDbLimit: (v: number) => void
}

export function NoiseMonitorWithControls({
  currentDb,
  dbLimit,
  setDbLimit,
}: Props) {
  const [realDb, setRealDb] = useState(0)
  const [micActive, setMicActive] = useState(false)

  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const dataArrayRef = useRef<Float32Array | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    let smoothDb = 0
    let lastUpdate = 0

    const initMic = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

        const audioCtx = new AudioContext()
        const source = audioCtx.createMediaStreamSource(stream)
        const analyser = audioCtx.createAnalyser()

        analyser.fftSize = 2048

        source.connect(analyser)

        audioCtxRef.current = audioCtx
        analyserRef.current = analyser
        dataArrayRef.current = new Float32Array(analyser.fftSize)

        setMicActive(true)

        const update = (time: number) => {
          if (!analyserRef.current || !dataArrayRef.current) return

          analyserRef.current.getFloatTimeDomainData(dataArrayRef.current)

          let sum = 0
          for (let i = 0; i < dataArrayRef.current.length; i++) {
            const v = dataArrayRef.current[i]
            sum += v * v
          }

          const rms = Math.sqrt(sum / dataArrayRef.current.length)
          const rawDb = Math.min(100, Math.max(0, rms * 80))

          // làm mượt
          smoothDb = smoothDb * 0.7 + rawDb * 0.3

          // chỉ cập nhật mỗi 0.5 giây
          if (time - lastUpdate > 500) {
            setRealDb(Math.round(smoothDb))
            lastUpdate = time
          }

          rafRef.current = requestAnimationFrame(update)
        }

        rafRef.current = requestAnimationFrame(update)
      } catch (err) {
        console.error("Mic error:", err)
      }
    }

    initMic()

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      audioCtxRef.current?.close()
    }
  }, [])

  return (
    <div className="glass-card rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-purple-700">
          Mức Âm Thanh Hiện Tại
        </h3>
        <span className={`text-sm ${micActive ? "text-green-600" : "text-red-600"}`}>
          {micActive ? "Mic đang bật" : "Mic tắt"}
        </span>
      </div>

      <div className="text-center">
        <div className="text-6xl font-bold text-purple-600">
          {realDb}
          <span className="text-2xl ml-1">dB</span>
        </div>

        <div className="mt-2 text-sm text-gray-500">
          Ngưỡng cho phép: {dbLimit} dB
        </div>
      </div>

      <div className="w-full bg-purple-100 rounded-full h-3 overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ${
            realDb > dbLimit ? "bg-red-500" : "bg-purple-500"
          }`}
          style={{ width: `${Math.min(100, realDb)}%` }}
        />
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-600">Ngưỡng:</span>
        <input
          type="range"
          min={30}
          max={100}
          value={dbLimit}
          onChange={(e) => setDbLimit(Number(e.target.value))}
          className="flex-1"
        />
      </div>
    </div>
  )
}
