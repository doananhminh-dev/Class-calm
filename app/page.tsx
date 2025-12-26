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
  const { db: currentDb, start: startNoiseMeter, started: noiseStarted } =
    useNoiseMeter();
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
  isNoiseExceeded: boolean;
}

function NoiseMonitorWithControls({
  db,
  dbLimit,
  setDbLimit,
  started,
  start,
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

  return (
    <div className="glass-card rounded-2xl p-4 md:p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg md:text-xl font-semibold text-purple-800">
            Giám Sát Âm Thanh Lớp Học
          </h2>
          <p className="text-xs md:text-sm text-gray-500">
            Bật mic để đo mức ồn theo thời gian thực và đặt ngưỡng dB cho lớp.
          </p>
        </div>
        <button
          onClick={start}
          disabled={started}
          className={`px-4 py-2 rounded-full text-sm font-medium shadow ${
            started
              ? "bg-gray-200 text-gray-500 cursor-default"
              : "bg-gradient-to-r from-purple-500 to-violet-600 text-white hover:brightness-110"
          }`}
        >
          {started ? "Đang đo âm thanh" : "Bắt đầu đo"}
        </button>
      </div>

      <div className="grid md:grid-cols-[2fr,1.5fr] gap-6">
        <div className="rounded-2xl bg-white/80 border border-purple-50 p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-gray-500">Mức ồn hiện tại</span>
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

          <div className="flex flex-col items-center gap-3">
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

        <div className="rounded-2xl bg-white/80 border border-purple-50 p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Ngưỡng âm thanh (dB)</span>
            <span className="text-base font-semibold text-purple-700">
              {dbLimit} dB
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleDecrease}
              className="w-8 h-8 rounded-full bg-purple-50 text-purple-600 border border-purple-100 flex items-center justify-center hover:bg-purple-100"
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
              className="w-8 h-8 rounded-full bg-purple-50 text-purple-600 border border-purple-100 flex items-center justify-center hover:bg-purple-100"
            >
              +
            </button>
          </div>

          <ul className="text-xs text-gray-500 list-disc list-inside space-y-1">
            <li>Giảm ngưỡng để lớp yên tĩnh hơn.</li>
            <li>
              Khi mức ồn vượt quá ngưỡng, trạng thái sẽ chuyển sang{" "}
              <span className="font-medium text-red-600">Vượt ngưỡng</span> và
              thiết bị sẽ rung trong 2 giây.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// Shared audio context
let sharedAudioContext: AudioContext | null = null;
let sharedAnalyser: AnalyserNode | null = null;
let sharedRAF: number | null = null;

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
    };
  }, []);

  const start = async () => {
    if (started) return;
    setStarted(true);

    if (!sharedAudioContext || !sharedAnalyser) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

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

  return { db, start, started };
}

/* ========== SCOREBOARD (ĐIỂM SỐ) ========== */

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

  const handleAddClass = () => {
    const name = window.prompt("Nhập tên lớp mới (ví dụ: 10A1):")?.trim();
    if (!name) return;

    const newClass: ClassRoom = {
      id: generateId("class"),
      name,
      groups: createDefaultGroups(),
    };
    setClasses((prev) => [...prev, newClass]);
    setActiveClassId(newClass.id);
  };

  const handleRenameClass = (cls: ClassRoom) => {
    const name = window.prompt("Đổi tên lớp:", cls.name)?.trim();
    if (!name) return;
    setClasses((prev) =>
      prev.map((c) => (c.id === cls.id ? { ...c, name } : c)),
    );
  };

  const updateActiveClassGroups = (updater: (groups: Group[]) => Group[]) => {
    if (!activeClass) return;
    setClasses((prev) =>
      prev.map((c) =>
        c.id === activeClass.id ? { ...c, groups: updater(c.groups) } : c,
      ),
    );
  };

  const handleAddGroup = () => {
    if (!activeClass) return;
    const name =
      window.prompt("Tên nhóm mới (ví dụ: Nhóm E):", "Nhóm mới")?.trim();
    if (!name) return;
    const newGroup: Group = {
      id: generateId("group"),
      name,
      score: 0,
      members: [],
    };
    updateActiveClassGroups((groups) => [...groups, newGroup]);
  };

  const handleRenameGroup = (group: Group) => {
    const name = window.prompt("Đổi tên nhóm:", group.name)?.trim();
    if (!name) return;
    updateActiveClassGroups((groups) =>
      groups.map((g) => (g.id === group.id ? { ...g, name } : g)),
    );
  };

  const handleChangeGroupScore = (group: Group, sign: 1 | -1) => {
    const raw = window
      .prompt("Nhập số điểm (ví dụ: 1, 2, 5...):", "1")
      ?.trim();
    if (!raw) return;
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return;

    const reason =
      window.prompt("Lý do (có thể để trống):", "")?.trim() ?? "";

    const delta = sign * value;

    updateActiveClassGroups((groups) =>
      groups.map((g) =>
        g.id === group.id ? { ...g, score: g.score + delta } : g,
      ),
    );

    onLog({
      classId: activeClass!.id,
      groupId: group.id,
      memberId: null,
      change: delta,
      reason,
      type: "group",
    });
  };

  const handleResetGroupScore = (group: Group) => {
    if (
      !window.confirm(
        `Reset toàn bộ điểm nhóm "${group.name}" về 0? Điểm cá nhân không đổi.`,
      )
    )
      return;
    updateActiveClassGroups((groups) =>
      groups.map((g) => (g.id === group.id ? { ...g, score: 0 } : g)),
    );
  };

  const handleAddMember = (group: Group) => {
    const name = window.prompt("Tên học sinh mới:", "Học sinh mới")?.trim();
    if (!name) return;
    const newMember: Member = {
      id: generateId("mem"),
      name,
      score: 0,
    };
    updateActiveClassGroups((groups) =>
      groups.map((g) =>
        g.id === group.id
          ? { ...g, members: [...g.members, newMember] }
          : g,
      ),
    );
  };

  const handleRenameMember = (group: Group, member: Member) => {
    const name = window.prompt("Đổi tên học sinh:", member.name)?.trim();
    if (!name) return;
    updateActiveClassGroups((groups) =>
      groups.map((g) =>
        g.id === group.id
          ? {
              ...g,
              members: g.members.map((m) =>
                m.id === member.id ? { ...m, name } : m,
              ),
            }
          : g,
      ),
    );
  };

  const handleRemoveMember = (group: Group, member: Member) => {
    if (
      !window.confirm(
        `Xóa học sinh "${member.name}" khỏi nhóm "${group.name}"?`,
      )
    )
      return;
    updateActiveClassGroups((groups) =>
      groups.map((g) =>
        g.id === group.id
          ? {
              ...g,
              members: g.members.filter((m) => m.id !== member.id),
            }
          : g,
      ),
    );
  };

  const handleChangeMemberScore = (
    group: Group,
    member: Member,
    sign: 1 | -1,
  ) => {
    const raw = window
      .prompt("Nhập số điểm (ví dụ: 1, 2, 5...):", "1")
      ?.trim();
    if (!raw) return;
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return;

    const reason =
      window.prompt("Lý do (có thể để trống):", "")?.trim() ?? "";

    const delta = sign * value;

    updateActiveClassGroups((groups) =>
      groups.map((g) =>
        g.id === group.id
          ? {
              ...g,
              members: g.members.map((m) =>
                m.id === member.id ? { ...m, score: m.score + delta } : m,
              ),
            }
          : g,
      ),
    );

    onLog({
      classId: activeClass!.id,
      groupId: group.id,
      memberId: member.id,
      change: delta,
      reason,
      type: "individual",
    });
  };

  const handleResetMemberScores = (group: Group) => {
    if (
      !window.confirm(
        `Reset toàn bộ điểm cá nhân trong nhóm "${group.name}" về 0? Điểm nhóm không đổi.`,
      )
    )
      return;
    updateActiveClassGroups((groups) =>
      groups.map((g) =>
        g.id === group.id
          ? {
              ...g,
              members: g.members.map((m) => ({ ...m, score: 0 })),
            }
          : g,
      ),
    );
  };

  if (!activeClass) {
    return (
      <div className="glass-card rounded-2xl p-4 md:p-6">
        <p className="text-sm text-gray-600">
          Chưa có lớp nào. Hãy thêm lớp mới để bắt đầu quản lý điểm.
        </p>
        <button
          onClick={handleAddClass}
          className="mt-3 px-4 py-2 rounded-full bg-gradient-to-r from-purple-500 to-violet-600 text-white text-sm font-medium"
        >
          + Thêm lớp
        </button>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl p-4 md:p-6 flex flex-col gap-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-lg md:text-xl font-semibold text-purple-800">
            Quản Lý Điểm Số
          </h2>
          <p className="text-xs md:text-sm text-gray-500">
            Mỗi lớp có các nhóm, học sinh, điểm nhóm và điểm cá nhân riêng.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          {classes.map((cls) => (
            <button
              key={cls.id}
              onClick={() => setActiveClassId(cls.id)}
              className={`px-3 py-1.5 rounded-full text-xs md:text-sm border transition ${
                cls.id === activeClass.id
                  ? "bg-purple-600 text-white border-purple-600"
                  : "bg-white text-gray-700 border-purple-100 hover:bg-purple-50"
              }`}
              title="Chọn lớp"
              onDoubleClick={() => handleRenameClass(cls)}
            >
              {cls.name}
            </button>
          ))}
          <button
            onClick={handleAddClass}
            className="px-3 py-1.5 rounded-full text-xs md:text-sm border border-dashed border-purple-300 text-purple-600 bg-purple-50/60 hover:bg-purple-100"
          >
            + Thêm lớp
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700">
          Lớp đang chọn:{" "}
          <span className="text-purple-700 font-semibold">
            {activeClass.name}
          </span>
        </h3>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {activeClass.groups.map((group) => (
          <div
            key={group.id}
            className="rounded-2xl bg-white/80 border border-purple-50 p-4 flex flex-col gap-3"
          >
            <div className="flex items-center justify-between">
              <div>
                <button
                  onClick={() => handleRenameGroup(group)}
                  className="text-sm font-semibold text-purple-800 hover:underline"
                >
                  {group.name}
                </button>
                <p className="text-xs text-gray-400">Điểm nhóm</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-purple-700">
                  {group.score}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleChangeGroupScore(group, 1)}
                className="px-2 py-1 rounded-full bg-green-50 text-green-700 text-xs border border-green-100"
              >
                + Điểm nhóm
              </button>
              <button
                onClick={() => handleChangeGroupScore(group, -1)}
                className="px-2 py-1 rounded-full bg-red-50 text-red-700 text-xs border border-red-100"
              >
                − Điểm nhóm
              </button>
              <button
                onClick={() => handleResetGroupScore(group)}
                className="ml-auto px-2 py-1 rounded-full bg-gray-50 text-gray-600 text-xs border border-gray-200"
              >
                Reset điểm nhóm
              </button>
            </div>

            <div className="border-t border-purple-50 pt-3 mt-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-600">
                  Thành viên nhóm
                </span>
                <button
                  onClick={() => handleAddMember(group)}
                  className="text-xs px-2 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-100"
                >
                  + Thêm học sinh
                </button>
              </div>

              {group.members.length === 0 ? (
                <p className="text-xs text-gray-400">
                  Chưa có học sinh. Nhấn &quot;+ Thêm học sinh&quot; để bắt đầu.
                </p>
              ) : (
                <div className="flex flex-col gap-2 max-h-52 overflow-y-auto pr-1">
                  {group.members.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between text-xs bg-purple-50/60 rounded-xl px-2 py-1.5"
                    >
                      <div className="flex flex-col">
                        <button
                          onClick={() => handleRenameMember(group, m)}
                          className="font-medium text-gray-800 text-left hover:underline"
                        >
                          {m.name}
                        </button>
                        <span className="text-[11px] text-gray-500">
                          Điểm cá nhân:{" "}
                          <span className="font-semibold text-purple-700">
                            {m.score}
                          </span>
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleChangeMemberScore(group, m, 1)}
                          className="w-7 h-7 rounded-full bg-green-500 text-white flex items-center justify-center text-xs"
                        >
                          +
                        </button>
                        <button
                          onClick={() => handleChangeMemberScore(group, m, -1)}
                          className="w-7 h-7 rounded-full bg-red-500 text-white flex items-center justify-center text-xs"
                        >
                          −
                        </button>
                        <button
                          onClick={() => handleRemoveMember(group, m)}
                          className="w-7 h-7 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-xs"
                          title="Xóa học sinh"
                        >
                          x
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {group.members.length > 0 && (
                <button
                  onClick={() => handleResetMemberScores(group)}
                  className="mt-2 text-[11px] text-gray-500 hover:text-gray-700 underline"
                >
                  Reset toàn bộ điểm cá nhân trong nhóm
                </button>
              )}
            </div>
          </div>
        ))}

        <button
          onClick={handleAddGroup}
          className="rounded-2xl border-2 border-dashed border-purple-200 bg-white/60 flex items-center justify-center text-sm text-purple-500 hover:bg-purple-50"
        >
          + Thêm nhóm mới trong lớp {activeClass.name}
        </button>
      </div>
    </div>
  );
}

/* ========== LỊCH SỬ ========== */

interface HistoryPageProps {
  classes: ClassRoom[];
  history: PointHistoryEntry[];
}

function HistoryPage({ classes, history }: HistoryPageProps) {
  const [classFilter, setClassFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "group" | "individual">(
    "all",
  );

  const classOptions = [{ id: "all", name: "Tất cả lớp" }].concat(
    classes.map((c) => ({ id: c.id, name: c.name })),
  );

  const filtered = history.filter((entry) => {
    if (classFilter !== "all" && entry.classId !== classFilter) return false;
    if (typeFilter !== "all" && entry.type !== typeFilter) return false;
    return true;
  });

  return (
    <div className="glass-card rounded-2xl p-4 md:p-6 flex flex-col gap-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-lg md:text-xl font-semibold text-purple-800">
            Lịch Sử Điểm Số
          </h2>
          <p className="text-xs md:text-sm text-gray-500">
            Theo dõi mọi lần cộng/trừ điểm theo từng lớp, nhóm và học sinh.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <select
            className="text-xs md:text-sm border border-purple-100 rounded-full px-3 py-1.5 bg-white/80"
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
          >
            {classOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                Lớp: {opt.name}
              </option>
            ))}
          </select>

          <select
            className="text-xs md:text-sm border border-purple-100 rounded-full px-3 py-1.5 bg-white/80"
            value={typeFilter}
            onChange={(e) =>
              setTypeFilter(e.target.value as "all" | "group" | "individual")
            }
          >
            <option value="all">Tất cả loại</option>
            <option value="group">Chỉ điểm nhóm</option>
            <option value="individual">Chỉ điểm cá nhân</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-500">
          Chưa có hoạt động nào phù hợp với bộ lọc.
        </p>
      ) : (
        <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto pr-1">
          {filtered.map((entry) => {
            const date = new Date(entry.timestamp);
            const timeStr = date.toLocaleTimeString("vi-VN", {
              hour: "2-digit",
              minute: "2-digit",
            });
            const dateStr = date.toLocaleDateString("vi-VN");
            const sign = entry.change > 0 ? "+" : "";
            const isGroup = entry.type === "group";

            return (
              <div
                key={entry.id}
                className="rounded-xl bg-white/90 border border-purple-50 px-3 py-2 text-xs flex flex-col gap-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-800">
                    Lớp {entry.className} • {entry.groupName}
                    {entry.memberName
                      ? ` • HS: ${entry.memberName}`
                      : " • Điểm nhóm"}
                  </span>
                  <span
                    className={`font-semibold ${
                      entry.change >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {sign}
                    {entry.change} điểm
                  </span>
                </div>
                <div className="flex justify-between text-[11px] text-gray-500">
                  <span>
                    Loại: {isGroup ? "Điểm nhóm" : "Điểm cá nhân"} | Ngày{" "}
                    {dateStr} {timeStr}
                  </span>
                  {entry.reason && (
                    <span className="italic truncate max-w-[50%]">
                      Lý do: {entry.reason}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ========== TRỢ LÝ AI ========== */

function AssistantChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const newMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: input.trim() },
    ];

    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });

      const data = await res.json();

      if (data.reply) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.reply as string },
        ]);
      } else if (data.error) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Trợ Lý AI đang gặp lỗi, vui lòng thử lại sau.",
          },
        ]);
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Có lỗi kết nối tới Trợ Lý AI, hãy thử lại sau ít phút.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="glass-card rounded-2xl p-4 md:p-6 flex flex-col h-[70vh]">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg md:text-xl font-semibold text-purple-800">
            Trợ Lý AI
          </h2>
          <p className="text-xs md:text-sm text-gray-500">
            Hỏi gợi ý hoạt động, bài tập, cách xử lý khi lớp ồn, quản lý nhóm,
            v.v.
          </p>
        </div>
        <div className="px-3 py-1.5 rounded-full bg-purple-50 text-purple-600 text-xs md:text-sm border border-purple-100">
          Luôn trả lời bằng tiếng Việt
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pr-1 mb-4">
        {messages.length === 0 && (
          <div className="text-sm text-gray-500 bg-purple-50 border border-dashed border-purple-200 rounded-xl p-3">
            Hãy bắt đầu bằng cách hỏi:{" "}
            <span className="font-medium">
              "Lớp em đang hơi ồn, em nên làm gì để các nhóm tập trung hơn?"
            </span>
          </div>
        )}

        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
              m.role === "user"
                ? "ml-auto bg-gradient-to-br from-purple-500 to-violet-600 text-white shadow"
                : "mr-auto bg-white/80 border border-purple-50 text-gray-800 shadow-sm"
            }`}
          >
            {m.content}
          </div>
        ))}

        {loading && (
          <div className="mr-auto rounded-2xl bg-white/80 border border-purple-50 px-3 py-2 text-sm text-gray-600 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
            <span>Trợ Lý AI đang gõ...</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-purple-100">
        <input
          className="flex-1 rounded-full border border-purple-100 bg-white/70 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent"
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
  );
}