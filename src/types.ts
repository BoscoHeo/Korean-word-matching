export interface WordItem {
  id: string;
  word: string;
  def: string;
  page: string;
  category?: string;
  example?: string;
}

export interface GameCard {
  cardId: string;
  wordId: string;
  type: 'word' | 'def';
  text: string;
}

export interface WrongWordRecord {
  word: string;
  def: string;
  wrongMatchesCount: number;
}

export interface LearningLog {
  id: string;
  studentName: string;
  gradeClass: string;
  pages: string[];
  totalWords: number;
  completedWords: number;
  score: number;
  timeElapsed: number; // seconds
  accuracy: number; // 0 - 100%
  wrongAttemptsCount: number;
  wrongWords: WrongWordRecord[];
  timestamp: string;
  mode: 'standard' | 'review' | 'custom';
}

export interface StudentSummary {
  studentName: string;
  gradeClass: string;
  totalGames: number;
  totalStudySeconds: number;
  averageScore: number;
  averageAccuracy: number;
  frequentlyMissedWords: { word: string; def: string; failCount: number }[];
  lastActive: string;
  history: LearningLog[];
}

export interface ClassAnalytics {
  totalStudents: number;
  totalGamesPlayed: number;
  classAverageAccuracy: number;
  totalStudyMinutes: number;
  topMissedWords: { word: string; def: string; failCount: number; page: string }[];
  dailyActivity: { date: string; gamesCount: number; avgScore: number }[];
}

export interface TeacherSettings {
  gasUrl?: string; // Optional Google Sheets Webhook URL
  autoSyncGoogleSheets?: boolean;
  passcode?: string;
}
