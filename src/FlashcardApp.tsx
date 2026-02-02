import { useState, useEffect } from "react";
import Papa from "papaparse";

const MODULE_COUNT = 14;

interface Flashcard {
  id: number;
  term: string;
  definition: string;
}

interface Module {
  id: number;
  name: string;
  cards: Flashcard[];
  lastScore: number | null;
}

function ScoreRing({ score, size = 52 }: { score: number; size?: number }) {
  const strokeWidth = size < 60 ? 4 : 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (score / 100) * circumference;
  const color = score >= 80 ? "#10b981" : score >= 60 ? "#f59e0b" : "#ef4444";
  const fontSize = size < 60 ? 11 : 15;

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="#e5e7eb" strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference - filled}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dasharray 0.6s cubic-bezier(.4,0,.2,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span style={{ fontSize, fontWeight: 700, color, lineHeight: 1 }}>{score}%</span>
      </div>
    </div>
  );
}

// Storage helpers using localStorage
const storage = {
  get: (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key: string, value: string): void => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Storage might be full or disabled
    }
  }
};

export default function FlashcardApp() {
  const [modules, setModules] = useState<Module[]>([]);
  const [storageLoaded, setStorageLoaded] = useState(false);
  const [view, setView] = useState<"menu" | "study" | "results">("menu");
  const [selectedModuleId, setSelectedModuleId] = useState<number | null>(null);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [sessionResults, setSessionResults] = useState<Record<number, boolean>>({});

  useEffect(() => {
    const init = () => {
      const loaded: Module[] = [];
      for (let i = 1; i <= MODULE_COUNT; i++) {
        let cards: Flashcard[] = [];
        let lastScore: number | null = null;

        const cardsData = storage.get(`mod_${i}_cards`);
        if (cardsData) {
          try {
            cards = JSON.parse(cardsData);
          } catch {
            // Invalid JSON
          }
        }

        const scoreData = storage.get(`mod_${i}_score`);
        if (scoreData) {
          try {
            lastScore = JSON.parse(scoreData);
          } catch {
            // Invalid JSON
          }
        }

        loaded.push({ id: i, name: `Module ${i}`, cards, lastScore });
      }
      setModules(loaded);
      setStorageLoaded(true);
    };
    init();
  }, []);

  const shuffleArray = <T,>(arr: T[]): T[] => {
    const s = [...arr];
    for (let i = s.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [s[i], s[j]] = [s[j], s[i]];
    }
    return s;
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>, moduleId: number) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      complete: (result) => {
        const cards = (result.data as string[][])
          .filter((row) => row.length >= 2 && row[0] && row[1])
          .map((row, i) => ({ id: i, term: row[0].trim(), definition: row[1].trim() }));
        if (cards.length > 0) {
          setModules((prev) => prev.map((m) => (m.id === moduleId ? { ...m, cards } : m)));
          storage.set(`mod_${moduleId}_cards`, JSON.stringify(cards));
        }
      },
      skipEmptyLines: true,
    });
    e.target.value = "";
  };

  const startModule = (moduleId: number) => {
    const mod = modules.find((m) => m.id === moduleId);
    if (!mod || mod.cards.length === 0) return;
    setSelectedModuleId(moduleId);
    setFlashcards(shuffleArray(mod.cards));
    setCurrentIndex(0);
    setIsFlipped(false);
    setSessionResults({});
    setView("study");
  };

  const handleAnswer = (correct: boolean) => {
    const newResults = { ...sessionResults, [flashcards[currentIndex].id]: correct };
    setSessionResults(newResults);

    if (currentIndex < flashcards.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setIsFlipped(false);
    } else {
      const correctCount = Object.values(newResults).filter(Boolean).length;
      const score = Math.round((correctCount / flashcards.length) * 100);
      setModules((prev) =>
        prev.map((m) => (m.id === selectedModuleId ? { ...m, lastScore: score } : m))
      );
      storage.set(`mod_${selectedModuleId}_score`, JSON.stringify(score));
      setView("results");
    }
  };

  const retryAll = () => {
    const mod = modules.find((m) => m.id === selectedModuleId);
    if (!mod) return;
    setFlashcards(shuffleArray(mod.cards));
    setCurrentIndex(0);
    setIsFlipped(false);
    setSessionResults({});
    setView("study");
  };

  const retryIncorrect = () => {
    const incorrect = flashcards.filter((c) => sessionResults[c.id] === false);
    if (incorrect.length === 0) return;
    setFlashcards(shuffleArray(incorrect));
    setCurrentIndex(0);
    setIsFlipped(false);
    setSessionResults({});
    setView("study");
  };

  // ─── LOADING ────────────────────────────────────────────────────────
  if (!storageLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#f8f7f5" }}>
        <p style={{ color: "#94a3b8", fontFamily: "system-ui", fontSize: 14 }}>Loading…</p>
      </div>
    );
  }

  // ─── MENU ───────────────────────────────────────────────────────────
  if (view === "menu") {
    const totalCards = modules.reduce((sum, m) => sum + m.cards.length, 0);
    const completedModules = modules.filter((m) => m.lastScore !== null).length;

    return (
      <div className="min-h-screen" style={{ background: "#f8f7f5", fontFamily: "'SF Pro Display', 'Segoe UI', system-ui, sans-serif" }}>
        <div className="max-w-4xl mx-auto px-5 py-8">

          {/* Header */}
          <div className="mb-7">
            <h1 className="text-3xl font-bold tracking-tight" style={{ color: "#1e293b", letterSpacing: "-0.02em" }}>
              Flashcard Studio
            </h1>
            <p className="text-sm mt-1" style={{ color: "#94a3b8" }}>
              {totalCards} total cards · {completedModules} modules studied
            </p>
          </div>

          {/* Module grid */}
          <div className="grid grid-cols-2 gap-3">
            {modules.map((mod) => {
              const hasCards = mod.cards.length > 0;
              return (
                <div
                  key={mod.id}
                  className="relative rounded-xl overflow-hidden"
                  style={{
                    background: "#fff",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                    transition: "box-shadow 0.2s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)")}
                  onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "0 1px 2px rgba(0,0,0,0.04)")}
                >
                  <div className="p-4">
                    {/* Top row: name + score */}
                    <div className="flex items-start justify-between">
                      <div className="flex-1 pr-3">
                        <h3 className="font-semibold text-sm" style={{ color: "#1e293b" }}>
                          {mod.name}
                        </h3>
                        <p className="text-xs mt-0.5" style={{ color: "#94a3b8" }}>
                          {hasCards ? `${mod.cards.length} flashcards` : "No cards uploaded"}
                        </p>
                      </div>
                      {mod.lastScore !== null && <ScoreRing score={mod.lastScore} size={48} />}
                    </div>

                    {/* Buttons */}
                    <div className="flex gap-2 mt-4">
                      <button
                        onClick={() => startModule(mod.id)}
                        disabled={!hasCards}
                        className="flex-1 text-xs font-semibold py-2 rounded-lg transition-all"
                        style={{
                          background: hasCards ? "#1e293b" : "#f1f5f9",
                          color: hasCards ? "#fff" : "#94a3b8",
                          cursor: hasCards ? "pointer" : "not-allowed",
                        }}
                      >
                        Study
                      </button>
                      <label className="flex-shrink-0 cursor-pointer">
                        <input
                          type="file"
                          accept=".csv"
                          className="hidden"
                          onChange={(e) => handleUpload(e, mod.id)}
                        />
                        <span
                          className="inline-block text-xs font-semibold py-2 px-3 rounded-lg transition-all"
                          style={{
                            border: "1px solid #e2e8f0",
                            color: "#64748b",
                            background: "#fafafa",
                          }}
                        >
                          {hasCards ? "Replace" : "Upload"}
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Format hint */}
          <div className="mt-6 rounded-lg p-3" style={{ background: "#eef2ff", border: "1px solid #c7d2fe" }}>
            <p className="text-xs" style={{ color: "#4338ca" }}>
              <strong>CSV format:</strong> Two columns — Term, Definition. Headers are skipped automatically if present.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ─── STUDY ──────────────────────────────────────────────────────────
  if (view === "study") {
    const card = flashcards[currentIndex];
    const progress = (currentIndex / flashcards.length) * 100;
    const mod = modules.find((m) => m.id === selectedModuleId);

    return (
      <div className="min-h-screen" style={{ background: "#f8f7f5", fontFamily: "'SF Pro Display', 'Segoe UI', system-ui, sans-serif" }}>
        <div className="max-w-xl mx-auto px-5 py-6">

          {/* Nav bar */}
          <div className="flex items-center justify-between mb-5">
            <button
              onClick={() => setView("menu")}
              className="text-xs font-medium flex items-center gap-1.5 transition-colors"
              style={{ color: "#94a3b8" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#64748b")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#94a3b8")}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7.5 9L4.5 6L7.5 3" />
              </svg>
              Menu
            </button>
            <span className="text-xs font-semibold" style={{ color: "#1e293b" }}>{mod?.name}</span>
            <span className="text-xs" style={{ color: "#94a3b8" }}>{currentIndex + 1} / {flashcards.length}</span>
          </div>

          {/* Progress bar */}
          <div className="w-full rounded-full mb-7" style={{ height: 3, background: "#e2e8f0" }}>
            <div
              className="rounded-full"
              style={{
                height: 3,
                width: `${progress}%`,
                background: "#1e293b",
                transition: "width 0.3s cubic-bezier(.4,0,.2,1)",
              }}
            />
          </div>

          {/* Flashcard */}
          <div
            onClick={() => setIsFlipped(!isFlipped)}
            className="rounded-2xl cursor-pointer select-none flex flex-col items-center justify-center text-center"
            style={{
              background: "#fff",
              border: "1px solid #e2e8f0",
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              minHeight: 320,
              padding: "40px 32px",
              transition: "box-shadow 0.2s, transform 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.1)";
              e.currentTarget.style.transform = "translateY(-2px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            {/* Label badge */}
            <span
              className="text-xs font-bold uppercase tracking-widest mb-5 px-2.5 py-0.5 rounded-full"
              style={{
                color: isFlipped ? "#059669" : "#64748b",
                background: isFlipped ? "#d1fae5" : "#f1f5f9",
                letterSpacing: "0.1em",
              }}
            >
              {isFlipped ? "Definition" : "Term"}
            </span>

            {/* Card content */}
            <p className="font-semibold leading-snug" style={{ color: "#1e293b", fontSize: 20 }}>
              {isFlipped ? card.definition : card.term}
            </p>

            {/* Tap hint */}
            <p className="text-xs mt-5" style={{ color: "#cbd5e1" }}>
              {isFlipped ? "tap to flip back" : "tap to reveal"}
            </p>
          </div>

          {/* Answer buttons */}
          <div className="flex gap-3 mt-5">
            <button
              onClick={() => handleAnswer(false)}
              className="flex-1 font-semibold rounded-xl transition-all"
              style={{ padding: "13px 0", background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", fontSize: 13 }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#fee2e2")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#fef2f2")}
            >
              ✕  Incorrect
            </button>
            <button
              onClick={() => handleAnswer(true)}
              className="flex-1 font-semibold rounded-xl transition-all"
              style={{ padding: "13px 0", background: "#ecfdf5", color: "#059669", border: "1px solid #a7f3d0", fontSize: 13 }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#d1fae5")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#ecfdf5")}
            >
              ✓  Correct
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── RESULTS ────────────────────────────────────────────────────────
  if (view === "results") {
    const correctCount = Object.values(sessionResults).filter(Boolean).length;
    const score = Math.round((correctCount / flashcards.length) * 100);
    const incorrectCards = flashcards.filter((c) => sessionResults[c.id] === false);
    const mod = modules.find((m) => m.id === selectedModuleId);

    return (
      <div className="min-h-screen" style={{ background: "#f8f7f5", fontFamily: "'SF Pro Display', 'Segoe UI', system-ui, sans-serif" }}>
        <div className="max-w-xl mx-auto px-5 py-6">

          {/* Nav bar */}
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => setView("menu")}
              className="text-xs font-medium flex items-center gap-1.5"
              style={{ color: "#94a3b8" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#64748b")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#94a3b8")}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7.5 9L4.5 6L7.5 3" />
              </svg>
              Menu
            </button>
            <span className="text-xs font-semibold" style={{ color: "#1e293b" }}>{mod?.name}</span>
            <span style={{ width: 40 }}></span>
          </div>

          {/* Score card */}
          <div
            className="rounded-2xl text-center"
            style={{
              background: "#fff",
              border: "1px solid #e2e8f0",
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              padding: "36px 24px 32px",
              marginBottom: 24,
            }}
          >
            <div className="flex justify-center mb-4">
              <ScoreRing score={score} size={80} />
            </div>
            <h2 className="font-bold" style={{ color: "#1e293b", fontSize: 22, letterSpacing: "-0.02em" }}>
              Session Complete
            </h2>
            <p className="text-xs mt-1.5" style={{ color: "#94a3b8" }}>
              <span style={{ color: "#10b981", fontWeight: 600 }}>{correctCount} correct</span>
              {"  ·  "}
              <span style={{ color: incorrectCards.length > 0 ? "#ef4444" : "#94a3b8", fontWeight: 600 }}>
                {incorrectCards.length} missed
              </span>
              {"  ·  "}
              {flashcards.length} total
            </p>
          </div>

          {/* Missed cards */}
          {incorrectCards.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <p className="text-xs font-bold uppercase tracking-widest mb-2.5" style={{ color: "#94a3b8", letterSpacing: "0.08em" }}>
                Cards to Review
              </p>
              <div className="space-y-2" style={{ maxHeight: 260, overflowY: "auto" }}>
                {incorrectCards.map((card) => (
                  <div
                    key={card.id}
                    className="rounded-lg"
                    style={{ background: "#fef2f2", border: "1px solid #fecaca", padding: "10px 12px" }}
                  >
                    <p className="font-semibold" style={{ color: "#1e293b", fontSize: 13 }}>{card.term}</p>
                    <p className="mt-0.5" style={{ color: "#64748b", fontSize: 12 }}>{card.definition}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={retryAll}
              className="flex-1 font-semibold rounded-xl transition-all"
              style={{ padding: "12px 0", background: "#1e293b", color: "#fff", fontSize: 13 }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#334155")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#1e293b")}
            >
              Retry All
            </button>
            {incorrectCards.length > 0 && (
              <button
                onClick={retryIncorrect}
                className="flex-1 font-semibold rounded-xl transition-all"
                style={{ padding: "12px 0", background: "#fefce8", color: "#a16207", border: "1px solid #fde047", fontSize: 13 }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#fef9c3")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#fefce8")}
              >
                Review Missed
              </button>
            )}
          </div>
          <button
            onClick={() => setView("menu")}
            className="w-full font-medium rounded-xl transition-all"
            style={{ marginTop: 10, padding: "10px 0", background: "#f1f5f9", color: "#64748b", fontSize: 13 }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#e2e8f0")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#f1f5f9")}
          >
            Back to Menu
          </button>
        </div>
      </div>
    );
  }

  return null;
}
