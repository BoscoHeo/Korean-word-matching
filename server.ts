import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { INITIAL_VOCABULARY_DATA } from "./src/data/initialWords.js";
import { LearningLog, TeacherSettings, LiveSession, WrongWordRecord } from "./src/types";

export const app = express();
const PORT = 3000;

// JSON body 크기 제한 (64KB) - DoS 방어 및 정상 학습 페이로드 충분한 수용
app.use(express.json({ limit: "64kb" }));

// Express JSON body parse error handler (413 & 400)
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err && (err.type === "entity.too.large" || err.status === 413)) {
    return res.status(413).json({ success: false, message: "요청 본문 크기가 제한(64KB)을 초과했습니다." });
  }
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({ success: false, message: "잘못된 JSON 형식입니다." });
  }
  next(err);
});

// Teacher PIN Rate Limiter (In-Memory)
interface PinAttemptRecord {
  count: number;
  firstAttempt: number;
  lockedUntil?: number;
}
const pinAttemptMap = new Map<string, PinAttemptRecord>();
const PIN_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5분
const PIN_RATE_LIMIT_MAX_ATTEMPTS = 5; // 최대 5회 실패 허용
const PIN_RATE_LIMIT_LOCK_MS = 5 * 60 * 1000; // 5회 초과 실패 시 5분 차단

// 주기적 만료 레코드 정리 (5분 간격)
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of pinAttemptMap.entries()) {
    if ((record.lockedUntil && now > record.lockedUntil) || (now - record.firstAttempt > PIN_RATE_LIMIT_WINDOW_MS * 2)) {
      pinAttemptMap.delete(ip);
    }
  }
}, 5 * 60 * 1000);

export function getClientIp(req: express.Request): string {
  return (req.ip || req.socket.remoteAddress || "unknown").toString();
}

export function recordPinFailure(ip: string): void {
  const now = Date.now();
  let attempt = pinAttemptMap.get(ip);
  if (!attempt || now - attempt.firstAttempt > PIN_RATE_LIMIT_WINDOW_MS) {
    attempt = { count: 1, firstAttempt: now };
  } else {
    attempt.count += 1;
  }
  if (attempt.count >= PIN_RATE_LIMIT_MAX_ATTEMPTS) {
    attempt.lockedUntil = now + PIN_RATE_LIMIT_LOCK_MS;
  }
  pinAttemptMap.set(ip, attempt);
}

export function clearPinRateLimit(ip: string): void {
  pinAttemptMap.delete(ip);
}

// Teacher session management (in-memory)
const SCRYPT_KEYLEN = 64;
const SCRYPT_SALT_BYTES = 16;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

interface TeacherSession {
  createdAt: number;
  expiresAt: number;
}
const teacherSessions = new Map<string, TeacherSession>();

export function hashPin(pin: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(SCRYPT_SALT_BYTES).toString("hex");
    crypto.scrypt(pin, salt, SCRYPT_KEYLEN, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`scrypt:${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

export function hashPinSync(pin: string): string {
  const salt = crypto.randomBytes(SCRYPT_SALT_BYTES).toString("hex");
  const derivedKey = crypto.scryptSync(pin, salt, SCRYPT_KEYLEN);
  return `scrypt:${salt}:${derivedKey.toString("hex")}`;
}

export function verifyPin(pin: string, stored: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!stored || !pin) return resolve(false);

    // Legacy plaintext support during progressive migration
    if (!stored.startsWith("scrypt:")) {
      return resolve(pin === stored);
    }

    const parts = stored.split(":");
    if (parts.length !== 3) return resolve(false);
    const salt = parts[1];
    const originalHash = Buffer.from(parts[2], "hex");

    crypto.scrypt(pin, salt, SCRYPT_KEYLEN, (err, derivedKey) => {
      if (err) return resolve(false);
      try {
        const matches = crypto.timingSafeEqual(originalHash, derivedKey);
        resolve(matches);
      } catch {
        resolve(false);
      }
    });
  });
}

export function createTeacherSession(): string {
  const now = Date.now();
  // Cleanup expired sessions
  for (const [t, s] of teacherSessions.entries()) {
    if (now > s.expiresAt) {
      teacherSessions.delete(t);
    }
  }

  const token = crypto.randomBytes(32).toString("hex");
  teacherSessions.set(token, {
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS
  });
  return token;
}

export function requireTeacherAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "교사 인증이 필요합니다." });
  }
  const token = authHeader.substring(7).trim();
  const session = teacherSessions.get(token);
  if (!session || Date.now() > session.expiresAt) {
    if (session) teacherSessions.delete(token);
    return res.status(401).json({ success: false, message: "인증 세션이 만료되었거나 유효하지 않습니다." });
  }
  next();
}

// Live active sessions stored in memory
const liveSessionsMap = new Map<string, LiveSession>();

// Cleanup stale sessions older than 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of liveSessionsMap.entries()) {
    const updated = new Date(session.lastUpdated).getTime();
    if (now - updated > 15 * 60 * 1000) {
      liveSessionsMap.delete(id);
    }
  }
}, 60 * 1000);

// Ensure data folder exists
const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const STORE_FILE = path.join(DATA_DIR, "learning_store.json");

interface DataStore {
  vocabulary: Record<string, { word: string; def: string; example?: string }[]>;
  logs: LearningLog[];
  settings: TeacherSettings & { passcodeHash?: string };
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
      const initialPin = process.env.TEACHER_INITIAL_PASSCODE || (process.env.NODE_ENV !== "production" ? "0000" : "");
      data.settings = {
        gasUrl: "https://script.google.com/macros/s/AKfycby7y17aCdMPi_NP6rWl4YXfUckniJLS2H620q0nXw0CEYSejHMTJYn-eFc_dnSruDvS/exec",
        autoSyncGoogleSheets: true,
        passcodeHash: initialPin ? hashPinSync(initialPin) : ""
      };
      saveStore(data);
    } else {
      let changed = false;
      if (!data.settings.gasUrl) {
        data.settings.gasUrl = "https://script.google.com/macros/s/AKfycby7y17aCdMPi_NP6rWl4YXfUckniJLS2H620q0nXw0CEYSejHMTJYn-eFc_dnSruDvS/exec";
        data.settings.autoSyncGoogleSheets = true;
        changed = true;
      }
      if (!data.settings.passcode && !data.settings.passcodeHash) {
        const initialPin = process.env.TEACHER_INITIAL_PASSCODE || (process.env.NODE_ENV !== "production" ? "0000" : "");
        if (initialPin) {
          data.settings.passcodeHash = hashPinSync(initialPin);
          changed = true;
        }
      }
      if (changed) saveStore(data);
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

// GET /api/words - fetch current word set pages (public for student gameplay)
app.get("/api/words", (req, res) => {
  const store = loadStore();
  res.json({ success: true, pages: store.vocabulary });
});

// POST /api/words - add or update custom page (teacher only)
app.post("/api/words", requireTeacherAuth, (req, res) => {
  const { pageName, words } = req.body;
  if (!pageName || !Array.isArray(words)) {
    return res.status(400).json({ success: false, message: "Invalid payload" });
  }
  const store = loadStore();
  store.vocabulary[pageName] = words;
  saveStore(store);
  res.json({ success: true, message: "단어 페이지가 저장되었습니다.", pages: store.vocabulary });
});

// GET /api/learning-logs (teacher only - contains student PII and scores)
app.get("/api/learning-logs", requireTeacherAuth, (req, res) => {
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

// Input validation helpers for public student endpoints
const CONTROL_CHARS_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export function validateAndSanitizeLearningLog(body: any): { valid: boolean; error?: string; data?: Omit<LearningLog, 'id'> } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { valid: false, error: "요청 데이터가 올바른 객체 형식이 아닙니다." };
  }

  // 1. studentName (필수, 1~50자)
  if (typeof body.studentName !== "string") {
    return { valid: false, error: "학생 이름은 필수 문자열입니다." };
  }
  const studentName = body.studentName.trim();
  if (studentName.length === 0 || studentName.length > 50) {
    return { valid: false, error: "학생 이름은 1자 이상 50자 이하이어야 합니다." };
  }
  if (CONTROL_CHARS_REGEX.test(studentName)) {
    return { valid: false, error: "학생 이름에 허용되지 않는 제어 문자가 포함되어 있습니다." };
  }

  // 2. gradeClass (선택, 최대 50자)
  let gradeClass = "";
  if (body.gradeClass !== undefined && body.gradeClass !== null) {
    if (typeof body.gradeClass !== "string") {
      return { valid: false, error: "학년/반 정보는 문자열이어야 합니다." };
    }
    gradeClass = body.gradeClass.trim();
    if (gradeClass.length > 50) {
      return { valid: false, error: "학년/반 정보는 50자 이하이어야 합니다." };
    }
    if (CONTROL_CHARS_REGEX.test(gradeClass)) {
      return { valid: false, error: "학년/반 정보에 허용되지 않는 제어 문자가 포함되어 있습니다." };
    }
  }

  // 3. pages (선택, string[] 최대 50개)
  let pages: string[] = [];
  if (body.pages !== undefined && body.pages !== null) {
    if (!Array.isArray(body.pages)) {
      return { valid: false, error: "학습 페이지 목록은 배열이어야 합니다." };
    }
    if (body.pages.length > 50) {
      return { valid: false, error: "학습 페이지 개수는 최대 50개까지 허용됩니다." };
    }
    for (const p of body.pages) {
      if (typeof p !== "string" || p.trim().length > 30 || CONTROL_CHARS_REGEX.test(p)) {
        return { valid: false, error: "유효하지 않은 페이지 항목이 포함되어 있습니다." };
      }
      pages.push(p.trim());
    }
  }

  // 4. 숫자 필드 검증 (음수 차단, finite number 확인)
  const checkNumber = (val: any, min: number, max: number, name: string): number => {
    if (typeof val !== "number" || !Number.isFinite(val) || Number.isNaN(val)) {
      throw new Error(`${name} 필드는 유효한 숫자여야 합니다.`);
    }
    if (val < min || val > max) {
      throw new Error(`${name} 값(${val})이 허용 범위(${min} ~ ${max})를 벗어났습니다.`);
    }
    return Math.round(val);
  };

  let totalWords = 0;
  let completedWords = 0;
  let score = 0;
  let timeElapsed = 0;
  let accuracy = 100;
  let wrongAttemptsCount = 0;

  try {
    totalWords = checkNumber(body.totalWords ?? 0, 0, 500, "총 단어 수(totalWords)");
    completedWords = checkNumber(body.completedWords ?? 0, 0, 500, "완료 단어 수(completedWords)");
    if (totalWords > 0 && completedWords > totalWords) {
      return { valid: false, error: "완료 단어 수가 총 단어 수보다 클 수 없습니다." };
    }

    // score: 단어당 100점 + 콤보 보너스 (최대 1,000,000점 허용)
    score = checkNumber(body.score ?? 0, 0, 1_000_000, "점수(score)");
    timeElapsed = checkNumber(body.timeElapsed ?? 0, 0, 86_400, "소요 시간(timeElapsed)");
    accuracy = checkNumber(body.accuracy ?? 100, 0, 100, "정확도(accuracy)");
    wrongAttemptsCount = checkNumber(body.wrongAttemptsCount ?? 0, 0, 10_000, "오답 시도 횟수(wrongAttemptsCount)");
  } catch (err: any) {
    return { valid: false, error: err.message };
  }

  // 5. wrongWords (선택, 최대 200개 객체 배열)
  let wrongWords: WrongWordRecord[] = [];
  if (body.wrongWords !== undefined && body.wrongWords !== null) {
    if (!Array.isArray(body.wrongWords)) {
      return { valid: false, error: "오답 목록은 배열이어야 합니다." };
    }
    if (body.wrongWords.length > 200) {
      return { valid: false, error: "오답 목록은 최대 200개까지 허용됩니다." };
    }
    for (const item of body.wrongWords) {
      if (!item || typeof item !== "object") {
        return { valid: false, error: "오답 항목 형식이 올바르지 않습니다." };
      }
      if (typeof item.word !== "string" || item.word.trim().length === 0 || item.word.trim().length > 100) {
        return { valid: false, error: "오답 단어는 1자 이상 100자 이하의 문자열이어야 합니다." };
      }
      const defStr = typeof item.def === "string" ? item.def.trim() : "";
      if (defStr.length > 500) {
        return { valid: false, error: "오답 설명은 500자 이하이어야 합니다." };
      }
      const count = typeof item.wrongMatchesCount === "number" && Number.isFinite(item.wrongMatchesCount)
        ? Math.max(0, Math.min(1000, Math.round(item.wrongMatchesCount)))
        : 1;

      wrongWords.push({
        word: item.word.trim(),
        def: defStr,
        wrongMatchesCount: count
      });
    }
  }

  // 6. mode
  let mode = "standard";
  if (typeof body.mode === "string") {
    const trimmedMode = body.mode.trim();
    if (trimmedMode.length <= 30 && !CONTROL_CHARS_REGEX.test(trimmedMode)) {
      mode = trimmedMode;
    }
  }

  // 7. timestamp
  let timestamp = new Date().toISOString();
  if (typeof body.timestamp === "string") {
    const trimmedTs = body.timestamp.trim();
    if (trimmedTs.length <= 50 && !Number.isNaN(Date.parse(trimmedTs))) {
      timestamp = trimmedTs;
    }
  }

  return {
    valid: true,
    data: {
      studentName,
      gradeClass,
      pages,
      totalWords,
      completedWords,
      score,
      timeElapsed,
      accuracy,
      wrongAttemptsCount,
      wrongWords,
      timestamp,
      mode
    }
  };
}

// POST /api/learning-logs - save a new game result (public for student submission, strict validation)
app.post("/api/learning-logs", (req, res) => {
  let logPayload = req.body;
  if (typeof logPayload === "string") {
    try {
      logPayload = JSON.parse(logPayload);
    } catch {
      return res.status(400).json({ success: false, message: "잘못된 JSON 형식입니다." });
    }
  }

  const validation = validateAndSanitizeLearningLog(logPayload);
  if (!validation.valid || !validation.data) {
    return res.status(400).json({ success: false, message: validation.error || "입력 검증에 실패했습니다." });
  }

  const store = loadStore();
  // Sanitize: req.body 전체 spread 금지, 검증된 순수 데이터만 추출하여 저장
  const newLog: LearningLog = {
    ...validation.data,
    id: `log_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`
  };

  store.logs.unshift(newLog); // 최신순 저장
  saveStore(store);

  // If Google Sheets URL configured, attempt sync
  if (store.settings.gasUrl) {
    forwardToGoogleSheets(store.settings.gasUrl, newLog).catch(err => {
      console.warn("Failed auto sync to Google Sheets:", err);
    });
  }

  res.json({ success: true, log: newLog });
});

// GET /api/analytics/student/:name (teacher only)
app.get("/api/analytics/student/:name", requireTeacherAuth, (req, res) => {
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

// GET /api/analytics/class (teacher only)
app.get("/api/analytics/class", requireTeacherAuth, (req, res) => {
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

// LiveSession validation helper
const SESSION_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

export function validateAndSanitizeLiveSession(body: any): { valid: boolean; error?: string; data?: LiveSession } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { valid: false, error: "세션 데이터가 올바른 객체 형식이 아닙니다." };
  }

  if (typeof body.sessionId !== "string" || !SESSION_ID_REGEX.test(body.sessionId)) {
    return { valid: false, error: "유효하지 않은 세션 ID입니다." };
  }

  let studentName = "익명 학생";
  if (typeof body.studentName === "string" && body.studentName.trim().length > 0) {
    const trimmed = body.studentName.trim();
    if (trimmed.length > 50 || CONTROL_CHARS_REGEX.test(trimmed)) {
      return { valid: false, error: "학생 이름 형식이 올바르지 않습니다." };
    }
    studentName = trimmed;
  }

  let gradeClass = "";
  if (typeof body.gradeClass === "string") {
    const trimmed = body.gradeClass.trim();
    if (trimmed.length <= 50 && !CONTROL_CHARS_REGEX.test(trimmed)) {
      gradeClass = trimmed;
    }
  }

  const cleanNum = (val: any, max: number): number => {
    if (typeof val !== "number" || !Number.isFinite(val) || Number.isNaN(val)) return 0;
    return Math.max(0, Math.min(max, Math.round(val)));
  };

  const totalPairs = cleanNum(body.totalPairs, 500);
  const matchedPairs = cleanNum(body.matchedPairs, 500);
  const wrongAttempts = cleanNum(body.wrongAttempts, 10_000);
  const timeElapsed = cleanNum(body.timeElapsed, 86_400);
  const isCompleted = Boolean(body.isCompleted);

  let selectedPages: string[] = [];
  if (Array.isArray(body.selectedPages)) {
    selectedPages = body.selectedPages
      .filter((p: any) => typeof p === "string" && p.trim().length <= 30 && !CONTROL_CHARS_REGEX.test(p))
      .slice(0, 50);
  }

  let gameMode = "standard";
  if (typeof body.gameMode === "string" && body.gameMode.trim().length <= 30) {
    gameMode = body.gameMode.trim();
  }

  return {
    valid: true,
    data: {
      sessionId: body.sessionId,
      studentName,
      gradeClass,
      totalPairs,
      matchedPairs,
      wrongAttempts,
      timeElapsed,
      isCompleted,
      selectedPages,
      gameMode,
      lastUpdated: new Date().toISOString()
    }
  };
}

// POST /api/live-session - update or create a student's real-time playing progress
app.post("/api/live-session", (req, res) => {
  const validation = validateAndSanitizeLiveSession(req.body);
  if (!validation.valid || !validation.data) {
    return res.status(400).json({ success: false, message: validation.error || "올바른 세션 정보가 아닙니다." });
  }

  liveSessionsMap.set(validation.data.sessionId, validation.data);
  res.json({ success: true });
});

// GET /api/live-sessions - fetch active live sessions for teacher dashboard (teacher only)
app.get("/api/live-sessions", requireTeacherAuth, (req, res) => {
  const now = Date.now();
  const sessions = Array.from(liveSessionsMap.values())
    .map(s => {
      const diffSec = Math.floor((now - new Date(s.lastUpdated).getTime()) / 1000);
      return {
        ...s,
        isActive: diffSec < 90 // active if pinged within 90s
      };
    })
    .sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());

  res.json({ success: true, sessions });
});

// DELETE /api/live-session/:id (public for student cleanup, validated format)
app.delete("/api/live-session/:id", (req, res) => {
  const { id } = req.params;
  if (!id || typeof id !== "string" || !SESSION_ID_REGEX.test(id)) {
    return res.status(400).json({ success: false, message: "올바르지 않은 세션 ID 형식입니다." });
  }
  liveSessionsMap.delete(id);
  res.json({ success: true });
});

// POST /api/verify-pin (rate-limited by IP)
app.post("/api/verify-pin", async (req, res) => {
  const clientIp = getClientIp(req);
  const now = Date.now();
  const attempt = pinAttemptMap.get(clientIp);

  if (attempt && attempt.lockedUntil && now < attempt.lockedUntil) {
    const remainingSec = Math.ceil((attempt.lockedUntil - now) / 1000);
    return res.status(429).json({
      success: false,
      message: `너무 많은 인증 실패가 발생했습니다. ${remainingSec}초 후에 다시 시도해주세요.`
    });
  }

  const { pin } = req.body || {};
  if (!pin || typeof pin !== "string" || pin.length > 50) {
    recordPinFailure(clientIp);
    return res.status(401).json({ success: false, message: "선생님 비밀번호(PIN)가 올바르지 않습니다." });
  }

  const store = loadStore();
  const stored = store.settings?.passcodeHash || store.settings?.passcode || "";

  const isValid = await verifyPin(pin.trim(), stored);
  if (!isValid) {
    recordPinFailure(clientIp);
    return res.status(401).json({ success: false, message: "선생님 비밀번호(PIN)가 올바르지 않습니다." });
  }

  // Success: Clear rate limit failure record for this IP
  clearPinRateLimit(clientIp);

  // Progressive migration: If stored PIN was plaintext, upgrade to scrypt hash immediately
  if (store.settings?.passcode && !store.settings?.passcodeHash) {
    try {
      const hashed = await hashPin(pin.trim());
      store.settings.passcodeHash = hashed;
      delete store.settings.passcode;
      saveStore(store);
    } catch (e) {
      console.error("Failed to migrate legacy PIN to hash:", e);
    }
  }

  const token = createTeacherSession();
  res.json({
    success: true,
    token,
    expiresIn: SESSION_TTL_MS,
    message: "선생님 인증에 성공했습니다."
  });
});

// GET /api/settings & POST /api/settings (teacher only)
app.get("/api/settings", requireTeacherAuth, (req, res) => {
  const store = loadStore();
  // Never expose passcode or passcodeHash to client
  res.json({
    success: true,
    settings: {
      gasUrl: store.settings?.gasUrl || "",
      autoSyncGoogleSheets: store.settings?.autoSyncGoogleSheets ?? true
    }
  });
});

app.post("/api/settings", requireTeacherAuth, async (req, res) => {
  const { gasUrl, autoSyncGoogleSheets, passcode } = req.body;
  const store = loadStore();

  let newPasscodeHash = store.settings?.passcodeHash;
  if (passcode && typeof passcode === "string" && passcode.trim()) {
    newPasscodeHash = await hashPin(passcode.trim());
  }

  store.settings = {
    gasUrl: gasUrl !== undefined ? gasUrl : store.settings?.gasUrl,
    autoSyncGoogleSheets: autoSyncGoogleSheets !== undefined ? autoSyncGoogleSheets : store.settings?.autoSyncGoogleSheets,
    passcodeHash: newPasscodeHash
  };
  // Ensure legacy plaintext passcode is removed
  delete store.settings.passcode;

  saveStore(store);
  res.json({
    success: true,
    settings: {
      gasUrl: store.settings.gasUrl,
      autoSyncGoogleSheets: store.settings.autoSyncGoogleSheets
    },
    message: "선생님 환경설정이 저장되었습니다."
  });
});

// GET /api/teacher/session-check (SEC-1 verification endpoint)
app.get("/api/teacher/session-check", requireTeacherAuth, (req, res) => {
  res.json({ success: true, message: "교사 세션이 유효합니다." });
});

// POST /api/reset-data (teacher only)
app.post("/api/reset-data", requireTeacherAuth, (req, res) => {
  const store = loadStore();
  store.logs = generateSampleLogs();
  saveStore(store);
  res.json({ success: true, message: "학습 데이터가 초기화되었습니다." });
});

// POST /api/reset-words (teacher only)
app.post("/api/reset-words", requireTeacherAuth, (req, res) => {
  const store = loadStore();
  store.vocabulary = INITIAL_VOCABULARY_DATA;
  saveStore(store);
  res.json({ success: true, message: "기본 어휘 데이터(1~13페이지)로 초기화되었습니다.", pages: store.vocabulary });
});

async function forwardToGoogleSheets(gasUrl: string, log: LearningLog) {
  try {
    const isPartial = log.completedWords < log.totalWords;
    const progressText = isPartial 
      ? `(${log.completedWords}/${log.totalWords}단어 완료)` 
      : `(총 ${log.totalWords}단어 완료)`;

    const payload = {
      studentName: log.studentName,
      gradeClass: log.gradeClass,
      page: `${log.pages.join(", ")} ${progressText}`,
      score: log.score,
      timeElapsedSeconds: log.timeElapsed,
      timeElapsed: `${log.timeElapsed}초`,
      elapsedTime: `${log.timeElapsed}초`,
      remainingTime: `${log.timeElapsed}초`,
      accuracy: `${log.accuracy}%`,
      timestamp: log.timestamp,
      status: log.mode || (isPartial ? "중단" : "완료"),
      wrongWords: (log.wrongWords || []).map((w) => `${w.word}(${w.def})`).join(", ")
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

if (process.env.NODE_ENV !== "test") {
  startServer();
}
