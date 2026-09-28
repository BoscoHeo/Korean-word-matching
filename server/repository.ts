import { LearningLog, TeacherSettings, WordItem } from '../src/types';

export interface StoredSettings extends TeacherSettings {
  passcodeHash?: string;
}

export type StoredWordItem = {
  id?: string;
  word: string;
  def: string;
  example?: string;
  page?: string;
  category?: string;
};

export interface DataRepository {
  // Settings
  getSettings(): Promise<StoredSettings>;
  updateSettings(patch: Partial<StoredSettings>): Promise<StoredSettings>;

  // Vocabulary
  getVocabulary(): Promise<Record<string, StoredWordItem[]>>;
  saveVocabularyPage(pageName: string, words: StoredWordItem[]): Promise<Record<string, StoredWordItem[]>>;
  resetVocabulary(): Promise<Record<string, StoredWordItem[]>>;

  // Learning Logs
  addLearningLog(logData: Omit<LearningLog, 'id'>): Promise<LearningLog>;
  getLearningLogs(filter?: { studentName?: string; gradeClass?: string }): Promise<LearningLog[]>;
  clearLearningLogs(sampleFallback?: boolean): Promise<void>;
}

let activeRepository: DataRepository | null = null;

export async function getRepository(): Promise<DataRepository> {
  if (activeRepository) {
    return activeRepository;
  }

  const backend = (process.env.DATA_BACKEND || 'json').toLowerCase();
  if (backend === 'firestore') {
    const { FirestoreRepository } = await import('./firestoreRepository.js');
    activeRepository = new FirestoreRepository();
  } else {
    const { JsonRepository } = await import('./jsonRepository.js');
    activeRepository = new JsonRepository();
  }

  return activeRepository;
}

// 테스트/주입용 리포지토리 설정 헬퍼
export function setActiveRepository(repo: DataRepository | null): void {
  activeRepository = repo;
}
