import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { INITIAL_VOCABULARY_DATA } from "./src/data/initialWords.js";
import { LearningLog, TeacherSettings } from "./src/types";

const app = express();
const PORT = 3000;

app.use(express.json());

// Ensure data folder exists
const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const STORE_FILE = path.join(DATA_DIR, "learning_store.json");

interface DataStore {
  vocabulary: Record<string, { word: string; def: string; example?: string }[]>;
  logs: LearningLog[];
  settings: TeacherSettings;
}

function loadStore(): DataStore {
  if (!fs.existsSync(STORE_FILE)) {
    const defaultStore: DataStore = {
      vocabulary: INITIAL_VOCABULARY_DATA,
      logs: generateSampleLogs(),
      settings: {
        gasUrl: "",
        autoSyncGoogleSheets: false
      }
    };
    saveStore(defaultStore);
    return defaultStore;
  }
  try {
    const raw = fs.readFileSync(STORE_FILE, "utf-8");
    const data = JSON.parse(raw);
    if (!data.settings) {
      data.settings = { gasUrl: "", autoSyncGoogleSheets: true, passcode: "1234" };
      saveStore(data);
    } else if (!data.settings.passcode) {
      data.settings.passcode = "1234";
      saveStore(data);
    }
    if (!data.vocabulary || Object.keys(data.vocabulary).length === 0) {
      data.vocabulary = INITIAL_VOCABULARY_DATA;
      saveStore(data);
    } else {
      let updated = false;
      Object.keys(INITIAL_VOCABULARY_DATA).forEach((pageKey) => {
        if (!data.vocabulary[pageKey] || data.vocabulary[pageKey].length < INITIAL_VOCABULARY_DATA[pageKey].length) {
          data.vocabulary[pageKey] = INITIAL_VOCABULARY_DATA[pageKey];
          updated = true;
        }
      });
      if (updated) {
        saveStore(data);
      }
    }
    return data;
  } catch (e) {
    console.error("Error reading store file, using initial data:", e);
    return {
      vocabulary: INITIAL_VOCABULARY_DATA,
      logs: [],
      settings: {}
    };
  }
}

function saveStore(store: DataStore) {
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), "utf-8");
  } catch (e) {
    console.error("Error saving store file:", e);
  }
}

// Generate realistic initial sample data so teachers can immediately test analytics
function generateSampleLogs(): LearningLog[] {
  const sampleStudents = [
    { name: "홍길동", gradeClass: "6학년 1반 15번" },
    { name: "김민준", gradeClass: "6학년 1반 03번" },
    { name: "이서연", gradeClass: "6학년 1반 12번" },
    { name: "박도현", gradeClass: "6학년 1반 08번" },
    { name: "최수아", gradeClass: "6학년 1반 21번" }
  ];

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const sampleLogs: LearningLog[] = [];

  sampleStudents.forEach((student, idx) => {
    // 3 to 5 logs per student over past few days
    const gameCount = 3 + (idx % 3);
    for (let i = 0; i < gameCount; i++) {
      const pageNum = (i % 3) + 1;
      const pages = [`${pageNum}페이지`];
      const timeElapsed = 45 + Math.floor(Math.random() * 60);
      const score = 1000 + Math.floor(Math.random() * 400);
      const wrongCount = Math.floor(Math.random() * 3);
      const totalWords = 12;
      const accuracy = Math.round(((totalWords - wrongCount) / totalWords) * 100);

      const wrongWordsList = wrongCount > 0 ? [
        { word: "추론", def: "알고 있는 사실을 바탕으로 다른 판단을 이끌어냄", wrongMatchesCount: 2 },
        { word: "모순", def: "앞뒤가 서로 어긋남", wrongMatchesCount: 1 }
      ].slice(0, wrongCount) : [];

      sampleLogs.push({
        id: `sample-${idx}-${i}-${Date.now()}`,
        studentName: student.name,
        gradeClass: student.gradeClass,
        pages,
        totalWords,
        completedWords: totalWords,
        score,
        timeElapsed,
        accuracy,
        wrongAttemptsCount: wrongCount,
        wrongWords: wrongWordsList,
        timestamp: new Date(now - (gameCount - i) * dayMs - idx * 3600000).toISOString(),
        mode: "standard"
      });
    }
  });

  return sampleLogs;
}

// REST API Endpoints

// GET /api/words - fetch current word set pages
app.get("/api/words", (req, res) => {
  const store = loadStore();
  res.json({ success: true, pages: store.vocabulary });
});

// POST /api/words - add or update custom page
app.post("/api/words", (req, res) => {
  const { pageName, words } = req.body;
  if (!pageName || !Array.isArray(words)) {
    return res.status(400).json({ success: false, message: "Invalid payload" });
  }
  const store = loadStore();
  store.vocabulary[pageName] = words;
  saveStore(store);
  res.json({ success: true, message: "단어 페이지가 저장되었습니다.", pages: store.vocabulary });
});

// GET /api/learning-logs
app.get("/api/learning-logs", (req, res) => {
  const store = loadStore();
  const { studentName, gradeClass } = req.query;
  let filtered = store.logs;

  if (studentName) {
    filtered = filtered.filter(l => l.studentName.toLowerCase().includes(String(studentName).toLowerCase()));
  }
  if (gradeClass) {
    filtered = filtered.filter(l => l.gradeClass.toLowerCase().includes(String(gradeClass).toLowerCase()));
  }

  res.json({ success: true, logs: filtered });
});

// POST /api/learning-logs - save a new game result
app.post("/api/learning-logs", (req, res) => {
  const logData: LearningLog = req.body;
  if (!logData.studentName) {
    return res.status(400).json({ success: false, message: "학생 이름이 필요합니다." });
  }

  const store = loadStore();
  const newLog: LearningLog = {
    ...logData,
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: logData.timestamp || new Date().toISOString()
  };

  store.logs.unshift(newLog); // latest first
  saveStore(store);

  // If Google Sheets URL configured, attempt sync
  if (store.settings.gasUrl) {
    forwardToGoogleSheets(store.settings.gasUrl, newLog).catch(err => {
      console.warn("Failed auto sync to Google Sheets:", err);
    });
  }

  res.json({ success: true, log: newLog });
});

// GET /api/analytics/student/:name
app.get("/api/analytics/student/:name", (req, res) => {
  const name = req.params.name;
  const store = loadStore();
  const studentLogs = store.logs.filter(l => l.studentName === name);

  if (studentLogs.length === 0) {
    return res.json({
      success: true,
      summary: null,
      message: "해당 학생의 학습 기록이 없습니다."
    });
  }

  const totalGames = studentLogs.length;
  const totalStudySeconds = studentLogs.reduce((acc, l) => acc + (l.timeElapsed || 0), 0);
  const avgScore = Math.round(studentLogs.reduce((acc, l) => acc + l.score, 0) / totalGames);
  const avgAccuracy = Math.round(studentLogs.reduce((acc, l) => acc + l.accuracy, 0) / totalGames);

  // Aggregate missed words
  const missedWordMap: Record<string, { def: string; failCount: number }> = {};
  studentLogs.forEach(l => {
    (l.wrongWords || []).forEach(w => {
      if (!missedWordMap[w.word]) {
        missedWordMap[w.word] = { def: w.def, failCount: 0 };
      }
      missedWordMap[w.word].failCount += (w.wrongMatchesCount || 1);
    });
  });

  const frequentlyMissedWords = Object.entries(missedWordMap)
    .map(([word, val]) => ({ word, def: val.def, failCount: val.failCount }))
    .sort((a, b) => b.failCount - a.failCount);

  const summary = {
    studentName: name,
    gradeClass: studentLogs[0].gradeClass,
    totalGames,
    totalStudySeconds,
    averageScore: avgScore,
    averageAccuracy: avgAccuracy,
    frequentlyMissedWords,
    lastActive: studentLogs[0].timestamp,
    history: studentLogs
  };

  res.json({ success: true, summary });
});

// GET /api/analytics/class
app.get("/api/analytics/class", (req, res) => {
  const store = loadStore();
  const logs = store.logs;

  if (logs.length === 0) {
    return res.json({
      success: true,
      analytics: {
        totalStudents: 0,
        totalGamesPlayed: 0,
        classAverageAccuracy: 0,
        totalStudyMinutes: 0,
        topMissedWords: [],
        dailyActivity: []
      }
    });
  }

  const uniqueStudents = new Set(logs.map(l => l.studentName)).size;
  const totalGamesPlayed = logs.length;
  const classAvgAccuracy = Math.round(logs.reduce((acc, l) => acc + l.accuracy, 0) / logs.length);
  const totalStudyMinutes = Math.round(logs.reduce((acc, l) => acc + (l.timeElapsed || 0), 0) / 60);

  // Aggregated missed words across class
  const classMissedMap: Record<string, { def: string; failCount: number; pages: Set<string> }> = {};
  logs.forEach(l => {
    (l.wrongWords || []).forEach(w => {
      if (!classMissedMap[w.word]) {
        classMissedMap[w.word] = { def: w.def, failCount: 0, pages: new Set(l.pages) };
      }
      classMissedMap[w.word].failCount += (w.wrongMatchesCount || 1);
      (l.pages || []).forEach(p => classMissedMap[w.word].pages.add(p));
    });
  });

  const topMissedWords = Object.entries(classMissedMap)
    .map(([word, val]) => ({
      word,
      def: val.def,
      failCount: val.failCount,
      page: Array.from(val.pages).join(", ")
    }))
    .sort((a, b) => b.failCount - a.failCount)
    .slice(0, 10);

  // Daily activity map for recent 7 days
  const dateMap: Record<string, { count: number; totalScore: number }> = {};
  logs.forEach(l => {
    const d = new Date(l.timestamp).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
    if (!dateMap[d]) {
      dateMap[d] = { count: 0, totalScore: 0 };
    }
    dateMap[d].count += 1;
    dateMap[d].totalScore += l.score;
  });

  const dailyActivity = Object.entries(dateMap).map(([date, val]) => ({
    date,
    gamesCount: val.count,
    avgScore: Math.round(val.totalScore / val.count)
  })).slice(-7);

  res.json({
    success: true,
    analytics: {
      totalStudents: uniqueStudents,
      totalGamesPlayed,
      classAverageAccuracy: classAvgAccuracy,
      totalStudyMinutes,
      topMissedWords,
      dailyActivity
    }
  });
});

// POST /api/verify-pin
app.post("/api/verify-pin", (req, res) => {
  const { pin } = req.body;
  const store = loadStore();
  const currentPin = store.settings?.passcode || "1234";
  if (pin === currentPin) {
    return res.json({ success: true, message: "선생님 인증에 성공했습니다." });
  } else {
    return res.status(401).json({ success: false, message: "선생님 비밀번호(PIN)가 올바르지 않습니다." });
  }
});

// GET /api/settings & POST /api/settings
app.get("/api/settings", (req, res) => {
  const store = loadStore();
  res.json({ success: true, settings: store.settings });
});

app.post("/api/settings", (req, res) => {
  const { gasUrl, autoSyncGoogleSheets, passcode } = req.body;
  const store = loadStore();
  store.settings = {
    ...store.settings,
    gasUrl: gasUrl !== undefined ? gasUrl : store.settings?.gasUrl,
    autoSyncGoogleSheets: autoSyncGoogleSheets !== undefined ? autoSyncGoogleSheets : store.settings?.autoSyncGoogleSheets,
    passcode: passcode !== undefined ? passcode : (store.settings?.passcode || "1234")
  };
  saveStore(store);
  res.json({ success: true, settings: store.settings, message: "선생님 환경설정이 저장되었습니다." });
});

// POST /api/reset-data
app.post("/api/reset-data", (req, res) => {
  const store = loadStore();
  store.logs = generateSampleLogs();
  saveStore(store);
  res.json({ success: true, message: "학습 데이터가 초기화되었습니다." });
});

// POST /api/reset-words
app.post("/api/reset-words", (req, res) => {
  const store = loadStore();
  store.vocabulary = INITIAL_VOCABULARY_DATA;
  saveStore(store);
  res.json({ success: true, message: "기본 어휘 데이터(1~13페이지)로 초기화되었습니다.", pages: store.vocabulary });
});

async function forwardToGoogleSheets(gasUrl: string, log: LearningLog) {
  try {
    const payload = {
      studentName: log.studentName,
      gradeClass: log.gradeClass,
      page: log.pages.join(", ") + ` (총 ${log.totalWords}단어)`,
      score: log.score,
      timeElapsedSeconds: log.timeElapsed,
      accuracy: `${log.accuracy}%`,
      timestamp: log.timestamp,
      status: "완료"
    };

    await fetch(gasUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.error("Google Sheets forward error:", err);
  }
}

// Vite integration
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}

startServer();
