"use client";

import {
  useState,
  useEffect,
  useRef,
  KeyboardEvent,
  Dispatch,
  SetStateAction,
} from "react";

/* ========== TYPES ========== */

export interface Member {
  id: string;
  name: string;
  score: number;
}

export interface Group {
  id: string;
  name: string;
  score: number;
  members: Member[];
}

export interface ClassRoom {
  id: string;
  name: string;
  groups: Group[];
}

export interface PointHistoryEntry {
  id: string;
  timestamp: number;
  classId: string;
  className: string;
  groupId: string;
  groupName: string;
  memberId: string | null;
  memberName: string | null;
  change: number;
  reason: string;
  type: "group" | "individual";
}

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

/* ========== HELPERS ========== */

function generateId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function createDefaultGroups(): Group[] {
  const names = ["Nhóm A", "Nhóm B", "Nhóm C", "Nhóm D"];
  return names.map((name, idx) => ({
    id: `group-${idx + 1}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    score: 0,
    members: [],
  }));
}

function createInitialClasses(): ClassRoom[] {
  const classNames = ["6A2", "7A2", "8A2", "9A2"];
  return classNames.map((name) => ({
    id: `class-${name}`,
    name,
    groups: createDefaultGroups(),
  }));
}

/* ========== MAIN PAGE ========== */

export default function ClassifyPage() {
  const [activeTab, setActiveTab] =
    useState<"sound" | "scoreboard" | "activity" | "ai">("sound");

  /* ====== ÂM THANH + RUNG ====== */
  const [dbLimit, setDbLimit] = useState(60);
  const {
    db: currentDb,
    start: startNoiseMeter,
    stop: stopNoiseMeter,
    started: noiseStarted,
  } = useNoiseMeter();
  const [isNoiseExceeded, setIsNoiseExceeded] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);

  const lastVibrateRef = useRef<number>(0);

  useEffect(() => {
    setIsMicActive(noiseStarted);
  }, [noiseStarted]);

  // Hysteresis tránh nhấp nháy
  useEffect(() => {
    const MARGIN = 2;
    setIsNoiseExceeded((prev) => {
      if (!noiseStarted) return false;
      if (!prev && currentDb >= dbLimit + MARGIN) return true;
      if (prev && currentDb <= dbLimit - MARGIN) return false;
      return prev;
    });
  }, [currentDb, dbLimit, noiseStarted]);

  // RUNG 2s KHI VỪA VƯỢT NGƯỠNG, COOLDOWN 3s
  useEffect(() => {
    if (!noiseStarted) return;
    if (!isNoiseExceeded) return;

    const now = Date.now();
    const COOLDOWN_MS = 3000;

    if (now - lastVibrateRef.current < COOLDOWN_MS) return;

    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(2000); // rung 2s
      lastVibrateRef.current = now;
    }
  }, [isNoiseExceeded, noiseStarted]);

  /* ====== LỚP HỌC + ĐIỂM & LỊCH SỬ ====== */

  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [history, setHistory] = useState<PointHistoryEntry[]>([]);
  const [activeClassId, setActiveClassId] = useState<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedClasses = localStorage.getItem("classify-classes-v2");
    const savedHistory = localStorage.getItem("classify-history-v2");
    const savedDbLimit = localStorage.getItem("classify-dbLimit");

    if (savedClasses) {
      try {
        const parsed: ClassRoom[] = JSON.parse(savedClasses);
        setClasses(parsed);
        if (parsed.length > 0) setActiveClassId(parsed[0].id);
      } catch {
        const defaults = createInitialClasses();
        setClasses(defaults);
        setActiveClassId(defaults[0].id);
      }
    } else {
      const defaults = createInitialClasses();
      setClasses(defaults);
      setActiveClassId(defaults[0].id);
    }

    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch {
        setHistory([]);
      }
    }

    if (savedDbLimit) {
      setDbLimit(Number.parseInt(savedDbLimit));
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("classify-classes-v2", JSON.stringify(classes));
  }, [classes]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("classify-history-v2", JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("classify-dbLimit", dbLimit.toString());
  }, [dbLimit]);

  const handleLogPoints = (params: {
    classId: string;
    groupId: string;
    memberId?: string | null;
    change: number;
    reason?: string;
    type: "group" | "individual";
  }) => {
    setHistory((prev) => {
      const cls = classes.find((c) => c.id === params.classId);
      const grp = cls?.groups.find((g) => g.id === params.groupId);
      const mem =
        params.memberId && grp
          ? grp.members.find((m) => m.id === params.memberId)
          : undefined;

      const entry: PointHistoryEntry = {
        id: generateId("hist"),
        timestamp: Date.now(),
        classId: params.classId,
        className: cls?.name ?? "",
        groupId: params.groupId,
        groupName: grp?.name ?? "",
        memberId: params.memberId ?? null,
        memberName: mem?.name ?? null,
        change: params.change,
        reason: params.reason ?? "",
        type: params.type,
      };

      return [entry, ...prev];
    });
  };

  const tabs = [
    { id: "sound" as const, label: "Âm Thanh" },
    { id: "scoreboard" as const, label: "Điểm Số" },
    { id: "activity" as const, label: "Lịch Sử" },
    { id: "ai" as const, label: "Trợ Lý AI" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-violet-50">
      <header className="glass-card sticky top-0 z-50 border-b border-purple-100/50 bg-white/80 backdrop-blur-xl">
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between py-4 border-b border-purple-100/40">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shadow-lg shadow-purple-500/40">
                <span className="text-white font-bold text-lg">C</span>
              </div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-violet-600 bg-clip-text text-transparent tracking-wide">
                ClassiFy
              </h1>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-50/80 border border-purple-200">
                <div
                  className={`w-2 h-2 rounded-full ${
                    isMicActive ? "bg-purple-600 animate-pulse" : "bg-gray-400"
                  }`}
                />
                <span className="text-sm text-gray-600">
                  {isMicActive ? "Mic Đang Bật" : "Mic Tắt"}
                </span>
              </div>
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${
                  isNoiseExceeded
                    ? "bg-red-50 border-red-200 text-red-700"
                    : "bg-green-50 border-green-200 text-green-700"
                }`}
              >
                <div
                  className={`w-2 h-2 rounded-full ${
                    isNoiseExceeded
                      ? "bg-red-600 animate-pulse"
                      : "bg-green-600"
                  }`}
                />
                <span className="text-sm font-medium">
                  {isNoiseExceeded ? "Vượt Ngưỡng" : "Bình Thường"}
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
            <NoiseMonitorWithControls
              db={currentDb}
              dbLimit={dbLimit}
              setDbLimit={setDbLimit}
              started={noiseStarted}
              start={startNoiseMeter}
              stop={stopNoiseMeter}
              isNoiseExceeded={isNoiseExceeded}
            />
          </div>
        )}

        {activeTab === "scoreboard" && (
          <ScoreboardPage
            classes={classes}
            setClasses={setClasses}
            activeClassId={activeClassId}
            setActiveClassId={setActiveClassId}
            onLog={handleLogPoints}
          />
        )}

        {activeTab === "activity" && (
          <HistoryPage classes={classes} history={history} />
        )}

        {activeTab === "ai" && (
          <div className="max-w-4xl mx-auto">
            <AssistantChat />
          </div>
        )}
      </main>

      {/* Dev signature */}
      <div className="fixed bottom-2 right-4 text-[11px] text-gray-400 opacity-80 select-none">
        Dev: AnhMinh
      </div>
    </div>
  );
}

/* ========== NOISE MONITOR + HOOK ========== */

interface NoiseMonitorProps {
  db: number;
  dbLimit: number;
  setDbLimit: (value: number) => void;
  started: boolean;
  start: () => void | Promise<void>;
  stop: () => void;
  isNoiseExceeded: boolean;
}

function NoiseMonitorWithControls({
  db,
  dbLimit,
  setDbLimit,
  started,
  start,
  stop,
  isNoiseExceeded,
}: NoiseMonitorProps) {
  const minLimit = 30;
  const maxLimit = 100;

  const handleChangeLimit = (value: number) => {
    const clamped = Math.max(minLimit, Math.min(maxLimit, value));
    setDbLimit(clamped);
  };

  const handleIncrease = () => handleChangeLimit(dbLimit + 1);
  const handleDecrease = () => handleChangeLimit(dbLimit - 1);

  const percent = Math.min(100, Math.max(0, db));

  const handleToggle = () => {
    if (!started) start();
    else stop();
  };

  return (
    <div className="glass-card rounded-2xl p-4 md:p-6 flex flex-col gap-6 bg-white/90 border border-purple-100 shadow-xl shadow-purple-100/60">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg md:text-xl font-semibold text-purple-800">
            Giám Sát Âm Thanh Lớp Học
          </h2>
          <p className="text-xs md:text-sm text-gray-600">
            Bật/tắt mic để đo mức ồn theo thời gian thực và đặt ngưỡng dB cho
            lớp.
          </p>
        </div>
        <button
          onClick={handleToggle}
          className={`px-4 py-2 rounded-full text-sm font-medium shadow ${
            started
              ? "bg-red-500 text-white hover:bg-red-600"
              : "bg-gradient-to-r from-purple-500 to-violet-600 text-white hover:brightness-110"
          }`}
        >
          {started ? "Tắt đo" : "Bắt đầu đo"}
        </button>
      </div>

      <div className="grid md:grid-cols-[2fr,1.5fr] gap-6">
        <div className="rounded-2xl bg-purple-50/80 border border-purple-100 p-4 flex flex-col justify-between">
          <div className="flex items-center justify_between mb-4">
            <span className="text-sm text-gray-600">Mức ồn hiện tại</span>
            <span
              className={`text-xs px-2 py-1 rounded-full border ${
                isNoiseExceeded
                  ? "bg-red-50 text-red-700 border-red-200"
                  : "bg-green-50 text-green-700 border-green-200"
              }`}
            >
              {isNoiseExceeded ? "Vượt ngưỡng" : "Trong giới hạn"}
            </span>
          </div>

          <div className="flex flex-col items_center gap-3">
            <div className="relative w-full h-4 rounded-full bg-gray-100 overflow-hidden">
              <div
                className={`h-full transition-[width,background-color] duration-300 ${
                  isNoiseExceeded
                    ? "bg-gradient-to-r from-amber-400 via-orange-500 to-red-600"
                    : "bg-gradient-to-r from-emerald-400 to-lime-500"
                }`}
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold text-purple-700">
                {Math.round(db)}
              </span>
              <span className="text-sm text-gray-500">dB</span>
            </div>
            <p className="text-xs text-gray-500 text-center">
              Giá trị là mức ồn tương đối (0–100), đã được làm mượt để tránh
              nhấp nháy.
            </p>
          </div>
        </div>

        <div className="rounded-2xl bg-white/80 border border-purple-100 p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Ngưỡng âm thanh (dB)</span>
            <span className="text-base font-semibold text-purple-700">
              {dbLimit} dB
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleDecrease}
              className="w-8 h-8 rounded-full bg-purple-50 text-purple-600 border border-purple-100 flex items_center justify-center hover:bg-purple-100"
            >
              −
            </button>
            <input
              type="range"
              min={minLimit}
              max={maxLimit}
              value={dbLimit}
              onChange={(e) => handleChangeLimit(Number(e.target.value))}
              className="flex-1 accent-purple-600"
            />
            <button
              onClick={handleIncrease}
              className="w-8 h-8 rounded-full bg-purple-50 text-purple-600 border border-purple-100 flex items_center justify-center hover:bg-purple-100"
            >
              +
            </button>
          </div>

          <ul className="text-xs text-gray-500 list-disc list-inside space_y-1">
            <li>Giảm ngưỡng để lớp yên tĩnh hơn.</li>
            <li>
              Khi mức ồn vượt quá ngưỡng, trạng thái sẽ chuyển sang{" "}
              <span className="font-medium text-red-600">Vượt ngưỡng</span> và
              thiết bị sẽ rung trong 2 giây (cooldown 3s).
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// Shared audio context + stream
let sharedAudioContext: AudioContext | null = null;
let sharedAnalyser: AnalyserNode | null = null;
let sharedRAF: number | null = null;
let sharedStream: MediaStream | null = null;

function useNoiseMeter() {
  const [db, setDb] = useState(0);
  const [started, setStarted] = useState(false);

  const dataArrayRef = useRef<Float32Array | null>(null);
  const smoothDbRef = useRef(0);

  useEffect(() => {
    return () => {
      if (sharedRAF !== null) {
        cancelAnimationFrame(sharedRAF);
        sharedRAF = null;
      }
      if (sharedStream) {
        sharedStream.getTracks().forEach((t) => t.stop());
        sharedStream = null;
      }
      if (sharedAudioContext) {
        sharedAudioContext.close();
        sharedAudioContext = null;
        sharedAnalyser = null;
      }
    };
  }, []);

  const start = async () => {
    if (started) return;
    setStarted(true);

    if (!sharedAudioContext || !sharedAnalyser) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      sharedStream = stream;

      const Ctx =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      sharedAudioContext = new Ctx();
      await sharedAudioContext.resume();

      const analyser = sharedAudioContext.createAnalyser();
      analyser.fftSize = 2048;
      sharedAnalyser = analyser;

      const source = sharedAudioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      dataArrayRef.current = new Float32Array(analyser.fftSize);
      smoothDbRef.current = 0;
    }

    const SMOOTHING = 0.15;
    const NOISE_GATE = 5;
    const MAX_STEP = 3;

    const update = () => {
      if (!sharedAnalyser || !dataArrayRef.current) {
        sharedRAF = requestAnimationFrame(update);
        return;
      }

      const arr = dataArrayRef.current;
      sharedAnalyser.getFloatTimeDomainData(arr);

      let sum = 0;
      for (let i = 0; i < arr.length; i++) {
        sum += arr[i] * arr[i];
      }

      const rms = Math.sqrt(sum / arr.length);

      let rawDb = rms * 120;
      if (!isFinite(rawDb) || isNaN(rawDb)) rawDb = 0;
      rawDb = Math.min(100, Math.max(0, rawDb));

      const gatedDb = rawDb < NOISE_GATE ? 0 : rawDb;

      const prev = smoothDbRef.current;
      let target = prev + (gatedDb - prev) * SMOOTHING;

      if (target > prev + MAX_STEP) target = prev + MAX_STEP;
      if (target < prev - MAX_STEP) target = prev - MAX_STEP;

      smoothDbRef.current = target;
      setDb(Math.round(target));

      sharedRAF = requestAnimationFrame(update);
    };

    if (sharedRAF === null) {
      sharedRAF = requestAnimationFrame(update);
    }
  };

  const stop = () => {
    setStarted(false);
    if (sharedRAF !== null) {
      cancelAnimationFrame(sharedRAF);
      sharedRAF = null;
    }
    if (sharedStream) {
      sharedStream.getTracks().forEach((t) => t.stop());
      sharedStream = null;
    }
    if (sharedAudioContext) {
      sharedAudioContext.close();
      sharedAudioContext = null;
      sharedAnalyser = null;
    }
    setDb(0);
  };

  return { db, start, stop, started };
}

/* ========== SCOREBOARD (GIỌNG NÓI + AI) ========== */

interface ScoreboardProps {
  classes: ClassRoom[];
  setClasses: Dispatch<SetStateAction<ClassRoom[]>>;
  activeClassId: string;
  setActiveClassId: (id: string) => void;
  onLog: (params: {
    classId: string;
    groupId: string;
    memberId?: string | null;
    change: number;
    reason?: string;
    type: "group" | "individual";
  }) => void;
}

function ScoreboardPage({
  classes,
  setClasses,
  activeClassId,
  setActiveClassId,
  onLog,
}: ScoreboardProps) {
  const activeClass =
    classes.find((c) => c.id === activeClassId) || classes[0] || null;

  // ====== GIỌNG NÓI + AI GROQ ======
  const [listening, setListening] = useState(false);
  const [lastTranscript, setLastTranscript] = useState("");
  const [pendingTranscript, setPendingTranscript] = useState("");
  const [voiceError, setVoiceError] = useState("");
  const recognitionRef = useRef<any>(null);

  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  // Fallback parser (dùng nếu AI lỗi)
  const fallbackLocalParse = (raw: string) => {
    if (!classes.length) {
      setVoiceError("Chưa có lớp nào để cộng điểm.");
      return;
    }

    const normText = normalize(raw);
    const normNoSpace = normText.replace(/\s+/g, "");

    // MẶC ĐỊNH LÀ CỘNG, CHỈ TRỪ KHI CÓ "TRU"
    let sign: 1 | -1 = normText.includes("tru") ? -1 : 1;

    // Lấy SỐ CUỐI CÙNG trong câu (tránh lấy số lớp như 6 trong 6A2)
    const numMatches = normText.match(/\d+/g);
    let amount = 1;
    if (numMatches && numMatches.length > 0) {
      amount = parseInt(numMatches[numMatches.length - 1], 10);
      if (!Number.isFinite(amount) || amount <= 0) amount = 1;
    }

    // Tìm lớp: khớp cả "6A2" lẫn "6 a 2"
    let targetClass: ClassRoom | null = null;
    for (const c of classes) {
      const nc = normalize(c.name); // "6a2"
      const ncNoSpace = nc.replace(/\s+/g, "");
      if (normText.includes(nc) || normNoSpace.includes(ncNoSpace)) {
        targetClass = c;
        break;
      }
    }
    if (!targetClass) targetClass = activeClass || classes[0] || null;
    if (!targetClass) {
      setVoiceError("Không xác định được lớp, hãy chọn lớp ở trên.");
      return;
    }

    // Tìm nhóm: PHẢI match, nếu không thì báo lỗi
    let targetGroup: Group | null = null;
    for (const g of targetClass.groups) {
      const ng = normalize(g.name); // "nhom a"
      const ngNoSpace = ng.replace(/\s+/g, "");
      const short = ng.replace("nhom ", ""); // "a"
      if (
        normText.includes(ng) ||
        (short && normText.includes(short)) ||
        normNoSpace.includes(ngNoSpace)
      ) {
        targetGroup = g;
        break;
      }
    }

    if (!targetGroup) {
      setVoiceError(
        'Không xác định được nhóm. Hãy nói rõ: "nhóm A", "nhóm B", "nhóm C"…',
      );
      return;
    }

    const delta = sign * amount;

    setClasses((prev) =>
      prev.map((c) =>
        c.id === targetClass!.id
          ? {
              ...c,
              groups: c.groups.map((g) =>
                g.id === targetGroup!.id
                  ? { ...g, score: g.score + delta }
                  : g,
              ),
            }
          : c,
      ),
    );

    if (targetClass.id !== activeClass?.id) {
      setActiveClassId(targetClass.id);
    }

    onLog({
      classId: targetClass.id,
      groupId: targetGroup.id,
      memberId: null,
      change: delta,
      reason: `Giọng nói (fallback): "${raw}"`,
      type: "group",
    });

    setLastTranscript(raw);
    setVoiceError("");
  };

  const handleTranscriptWithAI = async (raw: string) => {
    setVoiceError("");

    const classesForAi = classes.map((c) => ({
      name: c.name,
      groups: c.groups.map((g) => g.name),
    }));

    try {
      const res = await fetch("/api/voice-command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: raw, classes: classesForAi }),
      });

    const data = await res.json();

    if (!res.ok || data.error || data.ok === false) {
      console.warn("AI voice-command error:", data.error);
      setVoiceError(
        data.error ||
          "AI không hiểu lệnh giọng nói, đang dùng cách phân tích dự phòng.",
      );
      fallbackLocalParse(raw);
      return;
    }

    const className: string | undefined = data.className;
    const groupName: string | undefined = data.groupName;
    const action: "add" | "subtract" = data.action || "add";
    const amount: number = data.amount && data.amount > 0 ? data.amount : 1;

    if (!className || !groupName) {
      setVoiceError(
        "AI không tìm được lớp/nhóm phù hợp, đang dùng cách phân tích dự phòng.",
      );
      fallbackLocalParse(raw);
      return;
    }

    const targetClass =
      classes.find(
        (c) => normalize(c.name) === normalize(className as string),
      ) || activeClass;
    if (!targetClass) {
      setVoiceError(
        "AI không khớp được tên lớp với dữ liệu, đang dùng cách phân tích dự phòng.",
      );
      fallbackLocalParse(raw);
      return;
    }

    const targetGroup =
      targetClass.groups.find(
        (g) => normalize(g.name) === normalize(groupName as string),
      ) || null;

    if (!targetGroup) {
      setVoiceError(
        'AI không khớp được tên nhóm. Hãy nói rõ "Nhóm A/B/C/D".',
      );
      return;
    }

    const sign: 1 | -1 = action === "subtract" ? -1 : 1;
    const delta = sign * amount;

    setClasses((prev) =>
      prev.map((c) =>
        c.id === targetClass.id
          ? {
              ...c,
              groups: c.groups.map((g) =>
                g.id === targetGroup.id
                  ? { ...g, score: g.score + delta }
                  : g,
              ),
            }
          : c,
      ),
    );

    if (targetClass.id !== activeClass?.id) {
      setActiveClassId(targetClass.id);
    }

    onLog({
      classId: targetClass.id,
      groupId: targetGroup.id,
      memberId: null,
      change: delta,
      reason: `Giọng nói (AI): "${raw}"`,
      type: "group",
    });

    setLastTranscript(raw);
    setVoiceError("");
  } catch (err) {
    console.error("Lỗi gọi /api/voice-command:", err);
    setVoiceError(
      "Không kết nối được AI, đang dùng cách phân tích dự phòng.",
    );
    fallbackLocalParse(raw);
  }
};

  const handleVoiceToggle = () => {
    if (typeof window === "undefined") return;

    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      setVoiceError(
        "Trình duyệt không hỗ trợ nhận diện giọng nói (nên dùng Chrome hoặc Edge).",
      );
      return;
    }

    if (listening) {
      recognitionRef.current?.stop?.();
      recognitionRef.current = null;
      setListening(false);
      return;
    }

    setVoiceError("");
    setPendingTranscript("");
    const rec = new SR();
    recognitionRef.current = rec;
    rec.lang = "vi-VN";
    rec.continuous = false;
    rec.interimResults = false;
    if ("maxAlternatives" in rec) rec.maxAlternatives = 5;

    rec.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript as string;
      const clean = transcript.trim();
      setPendingTranscript(clean);
      setListening(false);
      recognitionRef.current = null;
    };

    rec.onerror = (event: any) => {
      console.error("Voice error", event);
      setVoiceError("Không nhận diện được, hãy thử lại và nói rõ ràng.");
      setListening(false);
      recognitionRef.current = null;
    };

    rec.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    setListening(true);
    rec.start();
  };

  /* ====== ĐIỂM SỐ THÔNG THƯỜNG (phần còn lại giữ nguyên) ====== */

  // ... (như các lần trước: thêm lớp, thêm nhóm, render nhóm & học sinh)

  // Để không vượt giới hạn ký tự, bạn có thể giữ nguyên phần dưới của file
  // từ lần trước, CHỈ THAY HÀM fallbackLocalParse và handleTranscriptWithAI
  // trong ScoreboardPage bằng phiên bản mới này.

}

/* ========== LỊCH SỬ & TRỢ LÝ AI GIỮ NGUYÊN ========== */
// HistoryPage và AssistantChat giữ đúng như bản bạn đang dùng.