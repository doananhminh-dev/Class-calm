"use client";

import {
  useState,
  useEffect,
  useRef,
  KeyboardEvent,
  Dispatch,
  SetStateAction,
} from "react";

import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
} from "firebase/firestore";

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

// Mặc định mỗi lớp có 6 nhóm: Nhóm 1–Nhóm 6
function createDefaultGroups(): Group[] {
  return Array.from({ length: 6 }, (_, idx) => ({
    id: `group-${idx + 1}`,
    name: `Nhóm ${idx + 1}`,
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

function normalizeText(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* ========== FIREBASE (GOOGLE SYNC) ========== */

const firebaseConfig = {
  apiKey: "AIzaSyDLfKsBT4icup2PMnzLXoV6malGF4NrH7U",
  authDomain: "class-calm.firebaseapp.com",
  projectId: "class-calm",
  storageBucket: "class-calm.firebasestorage.app",
  messagingSenderId: "420587824198",
  appId: "1:420587824198:web:d48927168da16d9be11647",
  measurementId: "G-85SCEN4JVR",
};

let fbApp: any = null;
let fbAuth: any = null;
let fbDb: any = null;
let fbProvider: any = null;

function ensureFirebase() {
  if (fbApp) return;
  fbApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  fbAuth = getAuth(fbApp);
  fbDb = getFirestore(fbApp);
  fbProvider = new GoogleAuthProvider();
}

/* ========== MAIN PAGE ========== */

export default function ClassifyPage() {
  const [activeTab, setActiveTab] =
    useState<"sound" | "scoreboard" | "activity" | "leaderboard" | "ai">(
      "sound",
    );

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
  const lastSoundRef = useRef<number>(0);
  const [alertVibrate, setAlertVibrate] = useState(true);
  const [alertSound, setAlertSound] = useState(false);

  useEffect(() => {
    setIsMicActive(noiseStarted);
  }, [noiseStarted]);

  useEffect(() => {
    const MARGIN = 2;
    setIsNoiseExceeded((prev) => {
      if (!noiseStarted) return false;
      if (!prev && currentDb >= dbLimit + MARGIN) return true;
      if (prev && currentDb <= dbLimit - MARGIN) return false;
      return prev;
    });
  }, [currentDb, dbLimit, noiseStarted]);

  useEffect(() => {
    if (!noiseStarted || !isNoiseExceeded || !alertVibrate) return;

    const now = Date.now();
    const COOLDOWN_MS = 3000;
    if (now - lastVibrateRef.current < COOLDOWN_MS) return;

    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(2000);
      lastVibrateRef.current = now;
    }
  }, [isNoiseExceeded, noiseStarted, alertVibrate]);

  useEffect(() => {
    if (!noiseStarted || !isNoiseExceeded || !alertSound) return;
    if (typeof window === "undefined") return;

    const now = Date.now();
    const COOLDOWN_MS = 3000;
    if (now - lastSoundRef.current < COOLDOWN_MS) return;

    const AudioCtx =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.12;

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
    osc.onended = () => {
      ctx.close();
    };

    lastSoundRef.current = now;
  }, [isNoiseExceeded, noiseStarted, alertSound]);

  /* ====== LỚP + LỊCH SỬ + CLOUD SYNC ====== */

  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [history, setHistory] = useState<PointHistoryEntry[]>([]);
  const [activeClassId, setActiveClassId] = useState<string>("");

  const [user, setUser] = useState<{
    uid: string;
    name: string | null;
    email: string | null;
  } | null>(null);
  const [cloudLoading, setCloudLoading] = useState(false);

  const cloudLoadedRef = useRef(false);
  const lastPushedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedClasses = localStorage.getItem("classify-classes-v3");
    const savedHistory = localStorage.getItem("classify-history-v3");
    const savedDbLimit = localStorage.getItem("classify-dbLimit-v3");

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
    localStorage.setItem("classify-classes-v3", JSON.stringify(classes));
  }, [classes]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("classify-history-v3", JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("classify-dbLimit-v3", dbLimit.toString());
  }, [dbLimit]);

  // Firebase Auth
  useEffect(() => {
    ensureFirebase();
    if (!fbAuth) return;
    const unsub = onAuthStateChanged(fbAuth, (u) => {
      if (u) {
        setUser({
          uid: u.uid,
          name: u.displayName,
          email: u.email,
        });
      } else {
        setUser(null);
        cloudLoadedRef.current = false;
      }
    });
    return () => unsub();
  }, []);

  const handleSignIn = async () => {
    try {
      ensureFirebase();
      if (!fbAuth || !fbProvider) return;
      await signInWithPopup(fbAuth, fbProvider);
    } catch (e) {
      console.error("Sign-in error", e);
    }
  };

  const handleSignOut = async () => {
    try {
      if (!fbAuth) return;
      await signOut(fbAuth);
    } catch (e) {
      console.error("Sign-out error", e);
    }
  };

  // Load từ Cloud khi user đăng nhập
  useEffect(() => {
    if (!user) return;
    ensureFirebase();
    if (!fbDb) return;

    setCloudLoading(true);
    const ref = doc(fbDb, "classifyUsers", user.uid);
    let unsubSnapshot: (() => void) | undefined;

    (async () => {
      try {
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data: any = snap.data();
          if (data.classes) setClasses(data.classes);
          if (data.history) setHistory(data.history);
        } else {
          await setDoc(ref, {
            classes,
            history,
            updatedAt: Date.now(),
          });
        }
        cloudLoadedRef.current = true;

        unsubSnapshot = onSnapshot(ref, (snap2) => {
          if (!snap2.exists()) return;
          const data2: any = snap2.data();
          const updatedAt = data2.updatedAt ?? 0;
          if (
            lastPushedAtRef.current &&
            updatedAt === lastPushedAtRef.current
          ) {
            return;
          }
          if (data2.classes) setClasses(data2.classes);
          if (data2.history) setHistory(data2.history);
        });
      } catch (e) {
        console.error("Cloud load error", e);
      } finally {
        setCloudLoading(false);
      }
    })();

    return () => {
      if (unsubSnapshot) unsubSnapshot();
    };
  }, [user?.uid]);

  // Save lên Cloud khi classes/history đổi
  useEffect(() => {
    if (!user || !fbDb || !cloudLoadedRef.current) return;
    const ref = doc(fbDb, "classifyUsers", user.uid);
    const updatedAt = Date.now();
    lastPushedAtRef.current = updatedAt;
    setDoc(ref, { classes, history, updatedAt }, { merge: true }).catch(
      (e) => console.error("Cloud save error", e),
    );
  }, [classes, history, user?.uid]);

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
    { id: "leaderboard" as const, label: "Bảng Xếp Hạng" },
    { id: "ai" as const, label: "Trợ Lý AI" },
  ];

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-purple-50 via-white to-violet-50 overflow-hidden">
      <BackgroundThreads />

      <header className="glass-card sticky top-0 z-50 border-b border-purple-100/50 bg-white/80 backdrop-blur-xl">
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between py-4 border-b border-purple-100/40">
            <div className="flex items-center_gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shadow-lg shadow-purple-500/40">
                <span className="text-white font-bold text-lg">C</span>
              </div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-violet-600 bg-clip-text text-transparent tracking-wide">
                Class-calm
              </h1>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex flex-col items-end gap-1 mr-2 text-right">
                {user ? (
                  <>
                    <span className="text-xs text-gray-600 max-w-[140px] truncate">
                      {user.name || user.email}
                    </span>
                    <button
                      onClick={handleSignOut}
                      className="text-[11px] px-2 py-0.5 rounded-full border border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100"
                    >
                      Đăng xuất
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleSignIn}
                    className="text-[11px] px-3 py-1 rounded-full border border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100"
                  >
                    Đăng nhập Google
                  </button>
                )}
                {cloudLoading && (
                  <span className="text-[10px] text-gray-400">
                    Đang đồng bộ đám mây...
                  </span>
                )}
              </div>

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

          <nav className="flex gap-1 py-2 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-shrink-0 px-6 py-3 rounded-lg font-medium transition-all ${
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

      <main className="container mx-auto px-6 py-8 relative z-10">
        {/* Ô login to dễ thấy */}
        {!user && (
          <div className="mb-5 max-w-3xl mx-auto p-3 md:p-4 rounded-xl bg-amber-50 border border-amber-200 flex flex-col md:flex-row md:items-center md:justify-between gap-2 text-xs md:text-sm text-amber-800">
            <span>
              Bạn chưa đăng nhập Google. Đăng nhập để{" "}
              <b>lưu và đồng bộ điểm</b> giữa điện thoại, laptop và các thiết
              bị khác.
            </span>
            <button
              onClick={handleSignIn}
              className="self-start md:self-auto px-3 py-1.5 rounded-full bg-amber-500 text-white text-xs md:text-sm font-semibold hover:bg-amber-600"
            >
              Đăng nhập Google
            </button>
          </div>
        )}

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
              alertVibrate={alertVibrate}
              setAlertVibrate={setAlertVibrate}
              alertSound={alertSound}
              setAlertSound={setAlertSound}
            />
          </div>
        )}

        {/* Phần còn lại (scoreboard, history, leaderboard, ai) sẽ nằm ở phần 2/3 & 3/3 */}
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

        {activeTab === "leaderboard" && (
          <LeaderboardPage classes={classes} />
        )}

        {activeTab === "ai" && (
          <div className="max-w-4xl mx-auto">
            <AssistantChat />
          </div>
        )}
      </main>

      <div className="fixed bottom-2 right-4 text-[11px] text-gray-400 opacity-80 select-none z-20">
        Dev: AnhMinh
      </div>
    </div>
  );
}

/* ========== BACKGROUND THREADS ========== */

function BackgroundThreads() {
  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="thread-line thread-1" />
        <div className="thread-line thread-2" />
        <div className="thread-line thread-3" />
      </div>

      <style jsx global>{`
        .thread-line {
          position: absolute;
          width: 2px;
          height: 260vh;
          background: linear-gradient(
            to bottom,
            rgba(168, 85, 247, 0) 0%,
            rgba(168, 85, 247, 0.9) 35%,
            rgba(129, 140, 248, 0.9) 60%,
            rgba(129, 140, 248, 0) 100%
          );
          opacity: 0.5;
          mix-blend-mode: screen;
          filter: blur(0.3px);
        }

        .thread-1 {
          left: 18%;
          animation: threadFloat1 22s linear infinite;
        }

        .thread-2 {
          left: 50%;
          animation: threadFloat2 26s linear infinite;
        }

        .thread-3 {
          left: 80%;
          animation: threadFloat3 30s linear infinite;
        }

        @keyframes threadFloat1 {
          0% {
            transform: translate3d(-40%, 120%, 0) rotate(8deg);
            opacity: 0;
          }
          10% {
            opacity: 0.7;
          }
          80% {
            opacity: 0.7;
          }
          100% {
            transform: translate3d(20%, -140%, 0) rotate(-4deg);
            opacity: 0;
          }
        }

        @keyframes threadFloat2 {
          0% {
            transform: translate3d(0%, 120%, 0) rotate(-8deg);
            opacity: 0;
          }
          15% {
            opacity: 0.6;
          }
          85% {
            opacity: 0.6;
          }
          100% {
            transform: translate3d(-30%, -150%, 0) rotate(3deg);
            opacity: 0;
          }
        }

        @keyframes threadFloat3 {
          0% {
            transform: translate3d(40%, 120%, 0) rotate(6deg);
            opacity: 0;
          }
          15% {
            opacity: 0.8;
          }
          85% {
            opacity: 0.8;
          }
          100% {
            transform: translate3d(-10%, -160%, 0) rotate(-4deg);
            opacity: 0;
          }
        }
      `}</style>
    </>
  );
}

/* ========== NOISE METER HOOK ========== */

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

    const SMOOTHING = 0.35;
    const NOISE_GATE = 0.4;
    const MAX_STEP = 7;

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

      let rawDb = rms * 220;
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

/* ========== NOISE MONITOR UI ========== */

interface NoiseMonitorProps {
  db: number;
  dbLimit: number;
  setDbLimit: (value: number) => void;
  started: boolean;
  start: () => void | Promise<void>;
  stop: () => void;
  isNoiseExceeded: boolean;
  alertVibrate: boolean;
  setAlertVibrate: (v: boolean) => void;
  alertSound: boolean;
  setAlertSound: (v: boolean) => void;
}

function NoiseMonitorWithControls({
  db,
  dbLimit,
  setDbLimit,
  started,
  start,
  stop,
  isNoiseExceeded,
  alertVibrate,
  setAlertVibrate,
  alertSound,
  setAlertSound,
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

      <div className="grid md:grid-cols-[2fr,1.7fr] gap-6">
        <div className="rounded-2xl bg-purple-50/80 border border-purple-100 p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
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
            <div className="flex flex-col items-center gap-3">
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
              nếu bật cảnh báo, máy sẽ rung hoặc phát âm thanh.
            </li>
          </ul>

          <div className="border-t border-purple-100 pt-3 mt-1">
            <span className="text-xs font-semibold text-gray-700">
              Kiểu cảnh báo khi vượt ngưỡng
            </span>
            <div className="mt-2 flex gap-4 text-xs">
              <label className="inline-flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={alertVibrate}
                  onChange={(e) => setAlertVibrate(e.target.checked)}
                  className="h-3 w-3 accent-purple-600"
                />
                <span>Rung</span>
              </label>
              <label className="inline-flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={alertSound}
                  onChange={(e) => setAlertSound(e.target.checked)}
                  className="h-3 w-3 accent-purple-600"
                />
                <span>Âm thanh nhẹ</span>
              </label>
            </div>
            <p className="mt-1 text-[11px] text-gray-400">
              Bạn có thể bật cả hai. Nếu tắt hết, khi vượt ngưỡng chỉ đổi màu
              trạng thái.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ========== SCOREBOARD (NHÓM + HS) ========== */

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

  // Voice NHÓM
  const [listening, setListening] = useState(false);
  const [lastTranscript, setLastTranscript] = useState("");
  const [pendingTranscript, setPendingTranscript] = useState("");
  const [voiceError, setVoiceError] = useState("");
  const recognitionRef = useRef<any>(null);

  // Voice HS
  const [listeningStudent, setListeningStudent] = useState(false);
  const [lastTranscriptStudent, setLastTranscriptStudent] = useState("");
  const [pendingTranscriptStudent, setPendingTranscriptStudent] =
    useState("");
  const [voiceErrorStudent, setVoiceErrorStudent] = useState("");
  const recognitionStudentRef = useRef<any>(null);

  /* ====== HÀM CHUNG: SỐ, NHÓM, ĐIỂM ====== */

  const wordToNumber: Record<string, number> = {
    mot: 1,
    nhat: 1,
    hai: 2,
    ba: 3,
    bon: 4,
    tu: 4,
    nam: 5,
    lam: 5,
    sau: 6,
  };

  const getFirstNumberFromString = (s: string): number | null => {
    const m = s.match(/\d+/);
    if (!m) return null;
    const n = parseInt(m[0], 10);
    if (!Number.isFinite(n)) return null;
    return n;
  };

  const extractGroupNumberFromText = (text: string): number | null => {
    const words = text.split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (w === "nhom" || w === "nhom:" || w === "nhom,") {
        let j = i + 1;
        if (j < words.length && words[j] === "so") j++;
        if (j >= words.length) continue;

        let token = words[j].replace(/[^0-9a-z]/g, "");
        if (!token) continue;

        if (/^\d+$/.test(token)) {
          const n = parseInt(token, 10);
          if (Number.isFinite(n) && n > 0) return n;
        }
        if (wordToNumber[token]) return wordToNumber[token];
      }
    }
    return null;
  };

  const findGroupByNumber = (cls: ClassRoom, groupNumber: number): Group | null => {
    if (groupNumber <= 0) return null;

    for (const g of cls.groups) {
      const ng = normalizeText(g.name);
      const n = getFirstNumberFromString(ng);
      if (n === groupNumber) return g;
    }

    const idx = groupNumber - 1;
    if (idx >= 0 && idx < cls.groups.length) return cls.groups[idx];
    return null;
  };

  const computeDeltaFromTranscript = (raw: string): number => {
    const norm = normalizeText(raw);

    const digitRegex = /\d+/g;
    let m: RegExpExecArray | null;
    let lastDigits: string | null = null;
    let lastIndex = -1;

    while ((m = digitRegex.exec(norm)) !== null) {
      lastDigits = m[0];
      lastIndex = m.index;
    }

    let sign: 1 | -1 = 1;
    let amount = 1;

    if (!lastDigits) {
      if (norm.includes("tru") || norm.includes("am")) sign = -1;
      else sign = 1;
      amount = 1;
    } else {
      amount = parseInt(lastDigits, 10);
      if (!Number.isFinite(amount) || amount <= 0) amount = 1;

      let explicit: 1 | -1 | 0 = 0;
      let i = lastIndex - 1;
      while (i >= 0 && /\s/.test(norm[i])) i--;

      if (i >= 0) {
        const ch = norm[i];
        if ("-−–—".includes(ch)) {
          explicit = -1;
        } else if (ch === "+") {
          explicit = 1;
        }
      }

      if (explicit !== 0) {
        sign = explicit as 1 | -1;
      } else {
        const nearStart = Math.max(0, lastIndex - 15);
        const near = norm.slice(nearStart, lastIndex);
        if (near.includes("tru") || near.includes("am")) sign = -1;
        else sign = 1;
      }
    }

    return sign * amount;
  };

  /* ====== PARSER NHÓM (fallback khi AI fail) ====== */

  const fallbackLocalParse = (raw: string) => {
    if (!classes.length) {
      setVoiceError("Chưa có lớp nào để cộng điểm.");
      return;
    }

    const text = normalizeText(raw);
    const textNoSpace = text.replace(/\s+/g, "");

    const delta = computeDeltaFromTranscript(raw);

    // TÌM LỚP
    let targetClass: ClassRoom | null = null;
    for (const c of classes) {
      const nc = normalizeText(c.name);
      const ncNoSpace = nc.replace(/\s+/g, "");
      if (text.includes(nc) || textNoSpace.includes(ncNoSpace)) {
        targetClass = c;
        break;
      }
    }
    if (!targetClass) targetClass = activeClass || classes[0] || null;
    if (!targetClass) {
      setVoiceError("Không xác định được lớp, hãy chọn lớp ở trên.");
      return;
    }

    // TÌM NHÓM
    let targetGroup: Group | null = null;
    const groupNum = extractGroupNumberFromText(text);
    if (groupNum !== null) {
      targetGroup = findGroupByNumber(targetClass, groupNum);
    }
    if (!targetGroup) {
      for (const g of targetClass.groups) {
        const ng = normalizeText(g.name);
        const ngNoSpace = ng.replace(/\s+/g, "");
        if (text.includes(ng) || textNoSpace.includes(ngNoSpace)) {
          targetGroup = g;
          break;
        }
      }
    }
    if (!targetGroup) {
      setVoiceError(
        'Không xác định được nhóm. Hãy nói rõ: "nhóm 1", "nhóm 2", "nhóm sáu/nhóm sau"...',
      );
      return;
    }

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
          (c) => normalizeText(c.name) === normalizeText(className as string),
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
          (g) => normalizeText(g.name) === normalizeText(groupName as string),
        ) || null;

      if (!targetGroup) {
        setVoiceError(
          'AI không khớp được tên nhóm. Hãy nói rõ "Nhóm 1/2/3..."',
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

  /* ====== HỖ TRỢ TÌM HỌC SINH ====== */

  const findMemberInClass = (raw: string, cls: ClassRoom) => {
    const text = normalizeText(raw);
    const textNoSpace = text.replace(/\s+/g, "");

    const preferredGroupIds = new Set<string>();

    const num = extractGroupNumberFromText(text);
    if (num !== null) {
      const g = findGroupByNumber(cls, num);
      if (g) preferredGroupIds.add(g.id);
    }

    for (const g of cls.groups) {
      const ng = normalizeText(g.name);
      const ngNoSpace = ng.replace(/\s+/g, "");
      if (text.includes(ng) || textNoSpace.includes(ngNoSpace)) {
        preferredGroupIds.add(g.id);
      }
    }

    const orderedGroups = [
      ...cls.groups.filter((g) => preferredGroupIds.has(g.id)),
      ...cls.groups.filter((g) => !preferredGroupIds.has(g.id)),
    ];

    for (const g of orderedGroups) {
      for (const m of g.members) {
        const nm = normalizeText(m.name);
        if (!nm) continue;
        if (text.includes(nm)) {
          return { member: m, group: g };
        }
      }
    }

    return null;
  };

  /* ====== GIỌNG NÓI HỌC SINH ====== */

  const applyStudentVoiceCommand = (raw: string) => {
    if (!classes.length) {
      setVoiceErrorStudent("Chưa có lớp nào để cộng/trừ điểm.");
      return;
    }

    const text = normalizeText(raw);
    const textNoSpace = text.replace(/\s+/g, "");

    const delta = computeDeltaFromTranscript(raw);

    let targetClass: ClassRoom | null = null;
    for (const c of classes) {
      const nc = normalizeText(c.name);
      const ncNoSpace = nc.replace(/\s+/g, "");
      if (text.includes(nc) || textNoSpace.includes(ncNoSpace)) {
        targetClass = c;
        break;
      }
    }
    if (!targetClass) targetClass = activeClass || classes[0] || null;
    if (!targetClass) {
      setVoiceErrorStudent("Không xác định được lớp, hãy chọn lớp ở trên.");
      return;
    }

    const hit = findMemberInClass(raw, targetClass);
    if (!hit) {
      setVoiceErrorStudent(
        "Không tìm được học sinh trong lớp. Hãy đọc đúng tên giống trong danh sách.",
      );
      return;
    }

    setClasses((prev) =>
      prev.map((c) =>
        c.id === targetClass!.id
          ? {
              ...c,
              groups: c.groups.map((g) =>
                g.id === hit.group.id
                  ? {
                      ...g,
                      score: g.score + delta,
                      members: g.members.map((m) =>
                        m.id === hit.member.id
                          ? { ...m, score: m.score + delta }
                          : m,
                      ),
                    }
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
      groupId: hit.group.id,
      memberId: hit.member.id,
      change: delta,
      reason: `Giọng nói HS: "${raw}"`,
      type: "individual",
    });

    setLastTranscriptStudent(raw);
    setVoiceErrorStudent("");
  };

  const handleVoiceToggleStudent = () => {
    if (typeof window === "undefined") return;

    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      setVoiceErrorStudent(
        "Trình duyệt không hỗ trợ nhận diện giọng nói (nên dùng Chrome hoặc Edge).",
      );
      return;
    }

    if (listeningStudent) {
      recognitionStudentRef.current?.stop?.();
      recognitionStudentRef.current = null;
      setListeningStudent(false);
      return;
    }

    setVoiceErrorStudent("");
    setPendingTranscriptStudent("");
    const rec = new SR();
    recognitionStudentRef.current = rec;
    rec.lang = "vi-VN";
    rec.continuous = false;
    rec.interimResults = false;

    rec.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript as string;
      const clean = transcript.trim();
      setPendingTranscriptStudent(clean);
      setListeningStudent(false);
      recognitionStudentRef.current = null;
    };

    rec.onerror = (event: any) => {
      console.error("Voice error HS", event);
      setVoiceErrorStudent(
        "Không nhận diện được, hãy thử lại và nói rõ ràng.",
      );
      setListeningStudent(false);
      recognitionStudentRef.current = null;
    };

    rec.onend = () => {
      setListeningStudent(false);
      recognitionStudentRef.current = null;
    };

    setListeningStudent(true);
    rec.start();
  };

  /* ====== CRUD LỚP / NHÓM / HS ====== */

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

  const handleRemoveClass = (cls: ClassRoom) => {
    if (
      !window.confirm(
        `Xoá lớp "${cls.name}"? Tất cả nhóm và học sinh trong lớp sẽ bị xoá khỏi bảng điểm (lịch sử vẫn giữ).`,
      )
    )
      return;

    setClasses((prev) => {
      const next = prev.filter((c) => c.id !== cls.id);
      if (next.length === 0) {
        setActiveClassId("");
      } else if (cls.id === activeClassId) {
        setActiveClassId(next[0].id);
      }
      return next;
    });
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
      window.prompt("Tên nhóm mới (ví dụ: Nhóm 7):", "Nhóm mới")?.trim();
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

  const handleRemoveGroup = (group: Group) => {
    if (
      !window.confirm(
        `Xoá nhóm "${group.name}" cùng toàn bộ học sinh và điểm trong nhóm?`,
      )
    )
      return;

    updateActiveClassGroups((groups) =>
      groups.filter((g) => g.id !== group.id),
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
              score: g.score + delta,
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

  const handleResetSingleMemberScore = (group: Group, member: Member) => {
    if (member.score === 0) return;
    if (
      !window.confirm(
        `Reset điểm cá nhân của "${member.name}" về 0? Điểm nhóm sẽ giảm ${member.score} điểm.`,
      )
    )
      return;

    const delta = -member.score;

    updateActiveClassGroups((groups) =>
      groups.map((g) =>
        g.id === group.id
          ? {
              ...g,
              score: g.score + delta,
              members: g.members.map((m) =>
                m.id === member.id ? { ...m, score: 0 } : m,
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
      reason: "Reset điểm cá nhân về 0",
      type: "individual",
    });
  };

  const handleResetMemberScores = (group: Group) => {
    if (
      !window.confirm(
        `Reset toàn bộ điểm cá nhân trong nhóm "${group.name}" về 0? Điểm nhóm sẽ giảm tương ứng.`,
      )
    )
      return;

    updateActiveClassGroups((groups) =>
      groups.map((g) => {
        if (g.id !== group.id) return g;
        const totalMemberScore = g.members.reduce(
          (sum, m) => sum + m.score,
          0,
        );
        return {
          ...g,
          score: g.score - totalMemberScore,
          members: g.members.map((m) => ({ ...m, score: 0 })),
        };
      }),
    );
  };

  if (!activeClass) {
    return (
      <div className="glass-card rounded-2xl p-4 md:p-6 bg-white/90 border border-purple-100">
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

  /* ====== JSX SCOREBOARD ====== */

  return (
    <div className="glass-card rounded-2xl p-4 md:p-6 flex flex-col gap-6 bg-white/95 border border-purple-100 shadow-lg shadow-purple-100/60">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-lg md:text-xl font-semibold text-purple-800">
            Quản Lý Điểm Số
          </h2>
          <p className="text-xs md:text-sm text-gray-600">
            Mỗi lớp có 6 nhóm, học sinh, điểm nhóm và điểm cá nhân riêng.
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

      {/* Voice NHÓM */}
      <div className="rounded-2xl bg-purple-50/70 border border-purple-100 p-3 flex flex-col gap-2">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div className="text-xs md:text-sm text-gray-700">
            Giọng nói nhóm:
            <br />
            <span className="text-[11px] text-gray-500">
              Ví dụ: &quot;lớp 6A2 nhóm 1 cộng 5 điểm&quot; hoặc &quot;7A2 nhóm 2 trừ 2
              điểm&quot;.
            </span>
          </div>
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={handleVoiceToggle}
              className={`px-3 py-1.5 rounded-full text-xs md:text-sm font-medium border ${
                listening
                  ? "bg-red-50 border-red-200 text-red-700"
                  : "bg-purple-600 border-purple-600 text-white"
              }`}
            >
              {listening ? "Tắt nghe nhóm" : "Nhấn để nói (NHÓM)"}
            </button>
            {lastTranscript && (
              <span className="text-[11px] text-gray-500">
                Nhóm - câu gần nhất: &quot;{lastTranscript}&quot;
              </span>
            )}
            {voiceError && (
              <span className="text-[11px] text-red-500">{voiceError}</span>
            )}
          </div>
        </div>

        {pendingTranscript && (
          <div className="mt-2 rounded-xl bg-white/95 border border-purple-100 px-3 py-2 text-xs text-gray-700">
            <div>
              <span className="font-medium">Nhóm - hệ thống nghe được:</span>{" "}
              <span className="italic">&quot;{pendingTranscript}&quot;</span>
            </div>
            <p className="mt-1 text-[11px] text-gray-500">
              Nếu đúng, bấm &quot;Đúng, thực hiện&quot; để cộng/trừ điểm nhóm.
            </p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => {
                  handleTranscriptWithAI(pendingTranscript);
                  setPendingTranscript("");
                }}
                className="px-3 py-1 rounded-full bg-purple-600 text-white text-xs font-medium hover:bg-purple-700"
              >
                Đúng, thực hiện
              </button>
              <button
                onClick={() => {
                  setPendingTranscript("");
                  setVoiceError("");
                }}
                className="px-3 py-1 rounded-full bg-gray-100 text-gray-700 text-xs border border-gray-300 hover:bg-gray-200"
              >
                Không đúng, nói lại
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Voice HỌC SINH */}
      <div className="rounded-2xl bg-indigo-50/70 border border-indigo-100 p-3 flex flex-col gap-2">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div className="text-xs md:text-sm text-gray-700">
            Giọng nói học sinh (điểm HS + nhóm):
            <br />
            <span className="text-[11px] text-gray-500">
              Ví dụ: &quot;6A2 nhóm 1 bạn An cộng 3 điểm&quot; hoặc &quot;6A2 bạn An trừ
              2 điểm&quot;.
            </span>
          </div>
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={handleVoiceToggleStudent}
              className={`px-3 py-1.5 rounded-full text-xs md:text-sm font-medium border ${
                listeningStudent
                  ? "bg-red-50 border-red-200 text-red-700"
                  : "bg-indigo-600 border-indigo-600 text-white"
              }`}
            >
              {listeningStudent ? "Tắt nghe HS" : "Nhấn để nói (HS)"}
            </button>
            {lastTranscriptStudent && (
              <span className="text-[11px] text-gray-500">
                HS - câu gần nhất: &quot;{lastTranscriptStudent}&quot;
              </span>
            )}
            {voiceErrorStudent && (
              <span className="text-[11px] text-red-500">
                {voiceErrorStudent}
              </span>
            )}
          </div>
        </div>

        {pendingTranscriptStudent && (
          <div className="mt-2 rounded-xl bg-white/95 border border-indigo-100 px-3 py-2 text-xs text-gray-700">
            <div>
              <span className="font-medium">HS - hệ thống nghe được:</span>{" "}
              <span className="italic">&quot;{pendingTranscriptStudent}&quot;</span>
            </div>
            <p className="mt-1 text-[11px] text-gray-500">
              Nếu đúng, bấm &quot;Đúng, thực hiện&quot; để cộng/trừ điểm cá nhân và nhóm.
            </p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => {
                  applyStudentVoiceCommand(pendingTranscriptStudent);
                  setPendingTranscriptStudent("");
                }}
                className="px-3 py-1 rounded-full bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700"
              >
                Đúng, thực hiện
              </button>
              <button
                onClick={() => {
                  setPendingTranscriptStudent("");
                  setVoiceErrorStudent("");
                }}
                className="px-3 py-1 rounded-full bg-gray-100 text-gray-700 text-xs border border-gray-300 hover:bg-gray-200"
              >
                Không đúng, nói lại
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Lớp đang chọn + xoá lớp */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700">
          Lớp đang chọn:{" "}
          <span className="text-purple-700 font-semibold">
            {activeClass.name}
          </span>
        </h3>
        <button
          onClick={() => handleRemoveClass(activeClass)}
          className="text-[11px] px-2 py-1 rounded-full border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
        >
          Xoá lớp này
        </button>
      </div>

      {/* Nhóm & thành viên */}
      <div className="grid md:grid-cols-2 gap-4">
        {activeClass.groups.map((group) => (
          <div
            key={group.id}
            className="rounded-2xl bg-white/90 border border-purple-100 p-4 flex flex-col gap-3 shadow-sm"
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

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => handleChangeGroupScore(group, 1)}
                className="px-2 py-1 rounded-full bg-green-50 text-green-700 text-xs border border-green-200"
              >
                + Điểm nhóm
              </button>
              <button
                onClick={() => handleChangeGroupScore(group, -1)}
                className="px-2 py-1 rounded-full bg-red-50 text-red-700 text-xs border border-red-200"
              >
                − Điểm nhóm
              </button>
              <button
                onClick={() => handleResetGroupScore(group)}
                className="px-2 py-1 rounded-full bg-gray-50 text-gray-600 text-xs border border-gray-200"
              >
                Reset điểm nhóm
              </button>
              <button
                onClick={() => handleRemoveGroup(group)}
                className="ml-auto px-2 py-1 rounded-full bg-red-50 text-red-600 text-xs border border-red-200"
              >
                Xoá nhóm
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
                          onClick={() =>
                            handleChangeMemberScore(group, m, -1)
                          }
                          className="w-7 h-7 rounded-full bg-red-500 text-white flex items-center justify-center text-xs"
                        >
                          −
                        </button>
                        <button
                          onClick={() =>
                            handleResetSingleMemberScore(group, m)
                          }
                          className="w-7 h-7 rounded-full bg-yellow-400 text-white flex items-center justify-center text-xs"
                          title="Reset điểm cá nhân về 0"
                        >
                          0
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
                  Reset toàn bộ điểm cá nhân trong nhóm (điểm nhóm giảm tương
                  ứng)
                </button>
              )}
            </div>
          </div>
        ))}

        <button
          onClick={handleAddGroup}
          className="rounded-2xl border-2 border-dashed border-purple-200 bg-white/70 flex items-center justify-center text-sm text-purple-600 hover:bg-purple-50"
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
    <div className="glass-card rounded-2xl p-4 md:p-6 flex flex-col gap-4 bg-white/95 border border-purple-100 shadow-lg shadow-purple-100/60">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-lg md:text-xl font-semibold text-purple-800">
            Lịch Sử Điểm Số
          </h2>
          <p className="text-xs md:text-sm text-gray-600">
            Theo dõi mọi lần cộng/trừ điểm theo từng lớp, nhóm và học sinh.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <select
            className="text-xs md:text-sm border border-purple-100 rounded-full px-3 py-1.5 bg-white/80 text-gray-800"
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
            className="text-xs md:text-sm border border-purple-100 rounded-full px-3 py-1.5 bg-white/80 text-gray-800"
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
                className="rounded-xl bg-white/95 border border-purple-50 px-3 py-2 text-xs flex flex-col gap-1 shadow-sm"
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
/* ========== BẢNG XẾP HẠNG ========== */

interface LeaderboardPageProps {
  classes: ClassRoom[];
}

type LeaderboardView = "grade" | "class" | "group";

interface PodiumEntry {
  name: string;
  score: number;
  subtitle?: string;
}

function LeaderboardPage({ classes }: LeaderboardPageProps) {
  const [view, setView] = useState<LeaderboardView>("grade");
  const [selectedGrade, setSelectedGrade] = useState<string>("");
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");

  const getGradeName = (className: string) => {
    const trimmed = className.trim();
    const m = trimmed.match(/^\d+/);
    if (!m) return "Khối khác";
    return `Khối ${m[0]}`;
  };

  useEffect(() => {
    if (!classes.length) return;

    if (!selectedClassId) {
      setSelectedClassId(classes[0].id);
    }

    if (!selectedGrade) {
      setSelectedGrade(getGradeName(classes[0].name));
    }
  }, [classes, selectedClassId, selectedGrade]);

  useEffect(() => {
    if (!classes.length) return;

    const currentClass =
      classes.find((c) => c.id === selectedClassId) || classes[0];

    if (!currentClass) return;

    if (!currentClass.groups.length) {
      setSelectedGroupId("");
      return;
    }

    const hasCurrentGroup = currentClass.groups.some(
      (g) => g.id === selectedGroupId,
    );

    if (!selectedGroupId || !hasCurrentGroup) {
      setSelectedGroupId(currentClass.groups[0].id);
    }
  }, [classes, selectedClassId, selectedGroupId]);

  const gradeOptions = Array.from(
    new Set(classes.map((c) => getGradeName(c.name))),
  );

  const currentClass =
    classes.find((c) => c.id === selectedClassId) || classes[0] || null;

  const currentGroups = currentClass?.groups ?? [];

  let description = "";
  let podiumEntries: PodiumEntry[] = [];

  if (view === "grade") {
    description =
      "Hiển thị 3 học sinh có điểm cá nhân cao nhất trong một khối.";

    if (selectedGrade) {
      const members: {
        member: Member;
        className: string;
        groupName: string;
      }[] = [];

      classes.forEach((cls) => {
        if (getGradeName(cls.name) !== selectedGrade) return;
        cls.groups.forEach((g) => {
          g.members.forEach((m) =>
            members.push({
              member: m,
              className: cls.name,
              groupName: g.name,
            }),
          );
        });
      });

      podiumEntries = members
        .sort((a, b) => b.member.score - a.member.score)
        .slice(0, 3)
        .map(({ member, className, groupName }) => ({
          name: member.name,
          score: member.score,
          subtitle: `Lớp ${className} • ${groupName}`,
        }));
    }
  } else if (view === "class") {
    description =
      "Hiển thị 3 học sinh có điểm cá nhân cao nhất trong một lớp.";

    if (currentClass) {
      const members: {
        member: Member;
        className: string;
        groupName: string;
      }[] = [];

      currentClass.groups.forEach((g) => {
        g.members.forEach((m) =>
          members.push({
            member: m,
            className: currentClass.name,
            groupName: g.name,
          }),
        );
      });

      podiumEntries = members
        .sort((a, b) => b.member.score - a.member.score)
        .slice(0, 3)
        .map(({ member, className, groupName }) => ({
          name: member.name,
          score: member.score,
          subtitle: `Lớp ${className} • ${groupName}`,
        }));
    }
  } else {
    description =
      "Hiển thị 3 học sinh có điểm cá nhân cao nhất trong một nhóm.";

    if (currentClass && currentGroups.length) {
      const currentGroup =
        currentGroups.find((g) => g.id === selectedGroupId) ||
        currentGroups[0];

      if (currentGroup) {
        podiumEntries = currentGroup.members
          .slice()
          .sort((a, b) => b.score - a.score)
          .slice(0, 3)
          .map((member) => ({
            name: member.name,
            score: member.score,
            subtitle: `Lớp ${currentClass.name} • ${currentGroup.name}`,
          }));
      }
    }
  }

  const hasClasses = classes.length > 0;
  const hasPodium = podiumEntries.length > 0;

  return (
    <div className="glass-card rounded-2xl p-4 md:p-6 flex flex-col gap-5 bg-white/95 border border-purple-100 shadow-lg shadow-purple-100/60 max-w-4xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-lg md:text-xl font-semibold text-purple-800">
            Bảng Xếp Hạng
          </h2>
          <p className="text-xs md:text-sm text-gray-600">
            Hạng 1–2–3 theo điểm cá nhân cao nhất.
          </p>
        </div>

        <div className="inline-flex rounded-full bg-purple-50 p-1 text-xs md:text-sm border border-purple-100">
          <button
            type="button"
            onClick={() => setView("grade")}
            className={`px-3 py-1 rounded-full font-medium ${
              view === "grade"
                ? "bg-white text-purple-700 shadow-sm"
                : "text-gray-600 hover:text-purple-700"
            }`}
          >
            Top Khối
          </button>
          <button
            type="button"
            onClick={() => setView("class")}
            className={`px-3 py-1 rounded-full font-medium ${
              view === "class"
                ? "bg-white text-purple-700 shadow-sm"
                : "text-gray-600 hover:text-purple-700"
            }`}
          >
            Top Lớp
          </button>
          <button
            type="button"
            onClick={() => setView("group")}
            className={`px-3 py-1 rounded-full font-medium ${
              view === "group"
                ? "bg-white text-purple-700 shadow-sm"
                : "text-gray-600 hover:text-purple-700"
            }`}
          >
            Top Nhóm
          </button>
        </div>
      </div>

      <div className="text-xs md:text-sm text-gray-600">{description}</div>

      {view === "grade" && gradeOptions.length > 0 && (
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[11px] md:text-xs text-gray-500">
            Chọn khối:
          </span>
          <select
            className="text-xs md:text-sm border border-purple-100 rounded-full px-3 py-1.5 bg-white/80 text-gray-800"
            value={selectedGrade || gradeOptions[0]}
            onChange={(e) => setSelectedGrade(e.target.value)}
          >
            {gradeOptions.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
      )}

      {view === "class" && classes.length > 0 && (
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[11px] md:text-xs text-gray-500">
            Chọn lớp:
          </span>
          <select
            className="text-xs md:text-sm border border-purple-100 rounded-full px-3 py-1.5 bg-white/80 text-gray-800"
            value={currentClass?.id || ""}
            onChange={(e) => setSelectedClassId(e.target.value)}
          >
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {view === "group" && classes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <span className="text-[11px] md:text-xs text-gray-500">
            Chọn lớp / nhóm:
          </span>
          <select
            className="text-xs md:text-sm border border-purple-100 rounded-full px-3 py-1.5 bg-white/80 text-gray-800"
            value={currentClass?.id || ""}
            onChange={(e) => setSelectedClassId(e.target.value)}
          >
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
              </option>
            ))}
          </select>

          <select
            className="text-xs md:text-sm border border-purple-100 rounded-full px-3 py-1.5 bg-white/80 text-gray-800"
            value={selectedGroupId}
            onChange={(e) => setSelectedGroupId(e.target.value)}
            disabled={!currentGroups.length}
          >
            {currentGroups.length === 0 ? (
              <option value="">Chưa có nhóm</option>
            ) : (
              currentGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))
            )}
          </select>
        </div>
      )}

      {!classes.length ? (
        <p className="text-sm text-gray-500 mt-2">
          Chưa có dữ liệu để xếp hạng.
        </p>
      ) : !hasPodium ? (
        <p className="text-sm text-gray-500 mt-2">
          Chưa có học sinh nào có điểm trong phạm vi đang chọn.
        </p>
      ) : (
        <LeaderboardPodium entries={podiumEntries} />
      )}
    </div>
  );
}

function LeaderboardPodium({ entries }: { entries: PodiumEntry[] }) {
  const [first, second, third] = entries;

  const renderSlot = (rank: 1 | 2 | 3, entry?: PodiumEntry) => {
    const medalSize = rank === 1 ? "w-16 h-16" : "w-12 h-12";
    const baseHeight =
      rank === 1
        ? "h-28 md:h-32"
        : rank === 2
        ? "h-24 md:h-28"
        : "h-20 md:h-24";

    const medalBg =
      rank === 1
        ? "bg-gradient-to-br from-yellow-400 to-amber-500 border-yellow-300"
        : rank === 2
        ? "bg-gradient-to-br from-slate-200 to-slate-400 border-slate-300"
        : "bg-gradient-to-br from-amber-700 to-orange-500 border-amber-400";

    const baseBg =
      rank === 1
        ? "bg-gradient-to-t from-yellow-200 to-yellow-50"
        : rank === 2
        ? "bg-gradient-to-t from-slate-200 to-slate-50"
        : "bg-gradient-to-t from-amber-200 to-amber-50";

    const nameColor =
      rank === 1
        ? "text-yellow-800"
        : rank === 2
        ? "text-slate-800"
        : "text-amber-800";

    return (
      <div
        key={rank}
        className="flex flex-col items-center justify-end flex-1 min-w-[84px] md:min-w-[110px]"
      >
        {entry ? (
          <>
            <div className="flex flex-col items-center mb-2">
              <div
                className={`flex items-center justify-center rounded-full border-2 shadow-lg ${medalBg} ${medalSize} text-white font-bold text-lg`}
              >
                {rank}
              </div>
              <div className="mt-1 text-center">
                <div
                  className={`text-xs md:text-sm font-semibold ${nameColor} max-w-[8rem] md:max-w-[9rem] truncate`}
                >
                  {entry.name}
                </div>
                {entry.subtitle && (
                  <div className="text-[10px] md:text-xs text-gray-500 max-w-[8rem] md:max-w-[9rem] truncate">
                    {entry.subtitle}
                  </div>
                )}
                <div className="text-[11px] md:text-xs text-gray-700">
                  {entry.score} điểm
                </div>
              </div>
            </div>
            <div
              className={`w-full ${baseBg} ${baseHeight} rounded-t-xl flex items-end justify-center pb-2 shadow-sm`}
            >
              <span className="text-[11px] md:text-xs font-semibold text-gray-700">
                Hạng {rank}
              </span>
            </div>
          </>
        ) : (
          <div
            className={`w-full bg-gray-100 ${baseHeight} rounded-t-xl flex items-end justify-center pb-2`}
          >
            <span className="text-[11px] md:text-xs font-medium text-gray-400">
              Chưa có
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="mt-3">
      <div className="flex items-end justify-center gap-3 md:gap-6">
        {renderSlot(2, second)}
        {renderSlot(1, first)}
        {renderSlot(3, third)}
      </div>
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
    <div className="glass-card rounded-2xl p-4 md:p-6 flex flex-col h-[70vh] bg-white/95 border border-purple-100 shadow-lg shadow-purple-100/60">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg md:text-xl font-semibold text-purple-800">
            Trợ Lý AI
          </h2>
          <p className="text-xs md:text-sm text-gray-600">
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
            className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-line ${
              m.role === "user"
                ? "ml-auto bg-gradient-to-br from-purple-500 to-violet-600 text-white shadow"
                : "mr-auto bg-white/90 border border-purple-50 text-gray-800 shadow-sm"
            }`}
          >
            {m.content}
          </div>
        ))}

        {loading && (
          <div className="mr-auto rounded-2xl bg-white/90 border border-purple-50 px-3 py-2 text-sm text-gray-600 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
            <span>Trợ Lý AI đang gõ...</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-purple-100">
        <input
          className="flex-1 rounded-full border border-purple-100 bg-white/70 px-4 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent"
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