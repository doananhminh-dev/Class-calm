"use client"

import { useState, useEffect, useRef, KeyboardEvent } from "react"
import { NoiseMonitorWithControls } from "@/components/noise-monitor-with-controls"
import { GroupManagement } from "@/components/group-management"
import { ActivityLog } from "@/components/activity-log"

export interface Member {
  id: string
  name: string
  score: number
}

export interface Group {
  id: string
  name: string
  members: Member[]
}

export interface PointHistoryEntry {
  id: string
  timestamp: number
  date: string
  groupId: string
  groupName: string
  memberId: string
  memberName: string
  change: number
  reason: string
  type: "group" | "individual"
}

type ChatMessage = {
  role: "user" | "assistant"
  content: string
}

export default function ClassifyPage() {
  const [activeTab, setActiveTab] = useState<"sound" | "scoreboard" | "activity" | "ai">("sound")
  const [currentDb, setCurrentDb] = useState(45)
  const [dbLimit, setDbLimit] = useState(60)
  const [groups, setGroups] = useState<Group[]>([])
  const [pointHistory, setPointHistory] = useState<PointHistoryEntry[]>([])
  const [isMicActive, setIsMicActive] = useState(false)

  // === ADDED: peak hold ===
  const [peakDb, setPeakDb] = useState(0)

  // === ADDED: audio refs ===
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const dataArrayRef = useRef<Uint8Array | null>(null)
  const rafRef = useRef<number>()

  useEffect(() => {
    const savedGroups = localStorage.getItem("classify-groups")
    const savedDbLimit = localStorage.getItem("classify-dbLimit")
    const savedHistory = localStorage.getItem("classify-pointHistory")

    if (savedGroups) {
      setGroups(JSON.parse(savedGroups))
    } else {
      const defaultGroups: Group[] = [
        { id: "group-a", name: "Nhóm A", members: [] },
        { id: "group-b", name: "Nhóm B", members: [] },
        { id: "group-c", name: "Nhóm C", members: [] },
        { id: "group-d", name: "Nhóm D", members: [] },
      ]
      setGroups(defaultGroups)
    }

    if (savedDbLimit) {
      setDbLimit(Number.parseInt(savedDbLimit))
    }

    if (savedHistory) {
      setPointHistory(JSON.parse(savedHistory))
    }
  }, [])

  useEffect(() => {
    if (groups.length > 0) {
      localStorage.setItem("classify-groups", JSON.stringify(groups))
    }
  }, [groups])

  useEffect(() => {
    localStorage.setItem("classify-dbLimit", dbLimit.toString())
  }, [dbLimit])

  useEffect(() => {
    if (pointHistory.length > 0) {
      localStorage.setItem("classify-pointHistory", JSON.stringify(pointHistory))
    }
  }, [pointHistory])

  // === REMOVED random generator, ADDED real mic measurement ===
  useEffect(() => {
    const startMic = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
        const audioContext = new AudioCtx()
        const analyser = audioContext.createAnalyser()
        analyser.fftSize = 2048

        const source = audioContext.createMediaStreamSource(stream)
        source.connect(analyser)

        const bufferLength = analyser.frequencyBinCount
        const dataArray = new Uint8Array(bufferLength)

        audioContextRef.current = audioContext
        analyserRef.current = analyser
        dataArrayRef.current = dataArray
        setIsMicActive(true)

        const update = () => {
          analyser.getByteTimeDomainData(dataArray)
          let sum = 0
          for (let i = 0; i < bufferLength; i++) {
            const v = (dataArray[i] - 128) / 128
            sum += v * v
          }
          const rms = Math.sqrt(sum / bufferLength)
          const db = Math.min(90, Math.max(30, 20 * Math.log10(rms) + 100))

          setCurrentDb(db)
          setPeakDb((prev) => (db > prev ? db : prev))

          if (db > dbLimit && navigator.vibrate) {
            navigator.vibrate(200)
          }

          rafRef.current = requestAnimationFrame(update)
        }

        update()
      } catch (err) {
        console.error("Mic error:", err)
        setIsMicActive(false)
      }
    }

    startMic()

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      audioContextRef.current?.close()
    }
  }, [dbLimit])

  const isNoiseExceeded = currentDb > dbLimit

  const tabs = [
    { id: "sound" as const, label: "Âm Thanh" },
    { id: "scoreboard" as const, label: "Điểm Số" },
    { id: "activity" as const, label: "Lịch Sử" },
    { id: "ai" as const, label: "Trợ Lý AI" },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-violet-50">
      <header className="glass-card sticky top-0 z-50 border-b border-purple-100/50">
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between py-4 border-b border-purple-100/30">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center">
                <span className="text-white font-bold text-lg">C</span>
              </div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-violet-600 bg-clip-text text-transparent">
                ClassiFy
              </h1>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-50 border border-purple-200">
                <div
                  className={`w-2 h-2 rounded-full ${isMicActive ? "bg-purple-600 animate-pulse" : "bg-gray-400"}`}
                />
                <span className="text-sm text-gray-600">{isMicActive ? "Mic Đang Bật" : "Mic Tắt"}</span>
              </div>
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${
                  isNoiseExceeded
                    ? "bg-red-50 border-red-200 text-red-700"
                    : "bg-green-50 border-green-200 text-green-700"
                }`}
              >
                <div
                  className={`w-2 h-2 rounded-full ${isNoiseExceeded ? "bg-red-600 animate-pulse" : "bg-green-600"}`}
                />
                <span className="text-sm font-medium">
                  {isNoiseExceeded ? "Vượt Ngưỡng" : "Bình Thường"} | Peak: {peakDb.toFixed(1)} dB
                </span>
              </div>
            </div>
          </div>

          <nav className="flex gap-1 py-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-6 py-3 rounded-lg font-medium transition-all ${
                  activeTab === tab.id
                    ? "bg-gradient-to-br from-purple-500 to-violet-600 text-white shadow-lg shadow-purple-500/30"
                    : "text-gray-600 hover:bg-purple-50 hover:text-purple-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        {activeTab === "sound" && (
          <div className="max-w-4xl mx-auto">
            <NoiseMonitorWithControls currentDb={currentDb} dbLimit={dbLimit} setDbLimit={setDbLimit} />
          </div>
        )}

        {activeTab === "scoreboard" && (
          <GroupManagement
            groups={groups}
            setGroups={setGroups}
            pointHistory={pointHistory}
            setPointHistory={setPointHistory}
          />
        )}

        {activeTab === "activity" && (
          <ActivityLog groups={groups} setGroups={setGroups} pointHistory={pointHistory} />
        )}

        {activeTab === "ai" && (
          <div className="max-w-4xl mx-auto">
            <AssistantChat />
          </div>
        )}
      </main>
    </div>
  )
}

function AssistantChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  const handleSend = async () => {
    if (!input.trim() || loading) return

    const userMsg: ChatMessage = {
      role: "user",
      content: input.trim(),
    }

    setMessages((prev) => [...prev, userMsg])
    setInput("")
    setLoading(true)

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...messages, userMsg] }),
      })

      const data = await res.json()

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply || "Xin lỗi, tôi chưa trả lời được lúc này.",
        },
      ])
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Có lỗi khi kết nối tới Trợ Lý AI.",
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="glass-card rounded-2xl p-4 md:p-6 flex flex-col h-[70vh]">
      {/* HEADER */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center text-white font-bold">
          AI
        </div>
        <div>
          <h2 className="text-lg font-semibold text-purple-800">Trợ Lý AI</h2>
          <p className="text-xs text-gray-500">
            Hỗ trợ quản lý lớp học & hoạt động
          </p>
        </div>
      </div>

      {/* CHAT BODY */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-2">
        {messages.length === 0 && (
          <div className="text-sm text-gray-500 bg-purple-50 border border-dashed border-purple-200 rounded-xl p-3">
            Gợi ý:{" "}
            <span className="font-medium">
              “Lớp đang ồn, nên xử lý thế nào?”
            </span>
          </div>
        )}

        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`flex items-end gap-2 ${
              m.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            {m.role === "assistant" && (
              <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 text-xs font-bold">
                AI
              </div>
            )}

            <div
              className={`max-w-[70%] px-4 py-2 rounded-2xl text-sm leading-relaxed shadow ${
                m.role === "user"
                  ? "bg-gradient-to-br from-purple-500 to-violet-600 text-white rounded-br-sm"
                  : "bg-white border border-purple-100 text-gray-800 rounded-bl-sm"
              }`}
            >
              {m.content}
            </div>

            {m.role === "user" && (
              <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-white text-xs font-bold">
                Bạn
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-end gap-2">
            <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 text-xs font-bold">
              AI
            </div>
            <div className="px-4 py-2 rounded-2xl bg-white border border-purple-100 text-sm text-gray-500 italic animate-pulse">
              Trợ Lý AI đang nhập…
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* INPUT */}
      <div className="flex items-center gap-2 pt-3 border-t border-purple-100">
        <input
          className="flex-1 rounded-full border border-purple-200 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
          placeholder="Nhập câu hỏi cho Trợ Lý AI..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          onClick={handleSend}
          disabled={loading}
          className="rounded-full bg-gradient-to-r from-purple-500 to-violet-600 px-4 py-2 text-sm font-medium text-white shadow hover:brightness-110 disabled:opacity-60"
        >
          Gửi
        </button>
      </div>
    </div>
  )
}
