import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DataRepository, StoredSettings, StoredWordItem } from './repository';
import { LearningLog } from '../src/types';
import { INITIAL_VOCABULARY_DATA } from '../src/data/initialWords.js';
import { hashPinSync } from '../server.js';

interface DataStore {
  vocabulary: Record<string, StoredWordItem[]>;
  logs: LearningLog[];
  settings: StoredSettings;
}

export class JsonRepository implements DataRepository {
  private storeFile: string;

  constructor() {
    const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
    this.storeFile = process.env.STORE_PATH || path.join(dataDir, 'learning_store.json');

    const storeDir = path.dirname(this.storeFile);
    if (!fs.existsSync(storeDir)) {
      fs.mkdirSync(storeDir, { recursive: true });
    }
  }

  private loadStore(): DataStore {
    if (!fs.existsSync(this.storeFile)) {
      const defaultStore: DataStore = {
        vocabulary: INITIAL_VOCABULARY_DATA,
        logs: this.generateSampleLogs(),
        settings: {
          gasUrl: 'https://script.google.com/macros/s/AKfycby7y17aCdMPi_NP6rWl4YXfUckniJLS2H620q0nXw0CEYSejHMTJYn-eFc_dnSruDvS/exec',
          autoSyncGoogleSheets: true,
          passcodeHash: this.getDefaultPasscodeHash()
        }
      };
      this.saveStore(defaultStore);
      return defaultStore;
    }

    try {
      const raw = fs.readFileSync(this.storeFile, 'utf-8');
      const data: DataStore = JSON.parse(raw);

      let changed = false;
      if (!data.settings) {
        data.settings = {
          gasUrl: 'https://script.google.com/macros/s/AKfycby7y17aCdMPi_NP6rWl4YXfUckniJLS2H620q0nXw0CEYSejHMTJYn-eFc_dnSruDvS/exec',
          autoSyncGoogleSheets: true,
          passcodeHash: this.getDefaultPasscodeHash()
        };
        changed = true;
      } else {
        if (!data.settings.gasUrl) {
          data.settings.gasUrl = 'https://script.google.com/macros/s/AKfycby7y17aCdMPi_NP6rWl4YXfUckniJLS2H620q0nXw0CEYSejHMTJYn-eFc_dnSruDvS/exec';
          data.settings.autoSyncGoogleSheets = true;
          changed = true;
        }
        if (!data.settings.passcode && !data.settings.passcodeHash) {
          const defaultHash = this.getDefaultPasscodeHash();
          if (defaultHash) {
            data.settings.passcodeHash = defaultHash;
            changed = true;
          }
        }
      }

      if (!data.vocabulary || Object.keys(data.vocabulary).length === 0) {
        data.vocabulary = INITIAL_VOCABULARY_DATA;
        changed = true;
      }

      if (changed) {
        this.saveStore(data);
      }

      return data;
    } catch (e) {
      console.error('Error reading store file, using initial data:', e);
      return {
        vocabulary: INITIAL_VOCABULARY_DATA,
        logs: [],
        settings: {}
      };
    }
  }

  private saveStore(store: DataStore): void {
    try {
      fs.writeFileSync(this.storeFile, JSON.stringify(store, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to save store file:', e);
    }
  }

  private getDefaultPasscodeHash(): string {
    const initialPin = process.env.TEACHER_INITIAL_PASSCODE || (process.env.NODE_ENV !== 'production' ? '0000' : '');
    return initialPin ? hashPinSync(initialPin) : '';
  }

  private generateSampleLogs(): LearningLog[] {
    const sampleNames = ['김민준', '이서연', '박도윤', '정하은', '최지후'];
    const sampleLogs: LearningLog[] = [];
    const now = Date.now();

    for (let i = 0; i < 20; i++) {
      const studentName = sampleNames[i % sampleNames.length];
      const timeOffset = (20 - i) * 3600 * 1000 * 4;
      const score = Math.floor(Math.random() * 400) + 600;
      const totalWords = 10;
      const wrongCount = Math.floor(Math.random() * 3);
      const completedWords = totalWords;
      const accuracy = Math.round(((totalWords - wrongCount) / totalWords) * 100);

      sampleLogs.push({
        id: `sample_log_${i + 1}`,
        studentName,
        gradeClass: '3-1',
        pages: ['1쪽', '2쪽'],
        totalWords,
        completedWords,
        score,
        timeElapsed: Math.floor(Math.random() * 60) + 40,
        accuracy,
        wrongAttemptsCount: wrongCount * 2,
        wrongWords: wrongCount > 0 ? [{ word: '어휘', def: '낱말의 모임', wrongMatchesCount: 1 }] : [],
        timestamp: new Date(now - timeOffset).toISOString(),
        mode: 'standard'
      });
    }

    return sampleLogs;
  }

  // --- DataRepository Methods ---

  async getSettings(): Promise<StoredSettings> {
    const store = this.loadStore();
    return { ...store.settings };
  }

  async updateSettings(patch: Partial<StoredSettings>): Promise<StoredSettings> {
    const store = this.loadStore();
    store.settings = {
      ...store.settings,
      ...patch
    };
    delete (store.settings as any).passcode; // legacy 제거
    this.saveStore(store);
    return { ...store.settings };
  }

  async getVocabulary(): Promise<Record<string, StoredWordItem[]>> {
    const store = this.loadStore();
    return { ...store.vocabulary };
  }

  async saveVocabularyPage(pageName: string, words: StoredWordItem[]): Promise<Record<string, StoredWordItem[]>> {
    const store = this.loadStore();
    store.vocabulary[pageName] = words;
    this.saveStore(store);
    return { ...store.vocabulary };
  }

  async resetVocabulary(): Promise<Record<string, StoredWordItem[]>> {
    const store = this.loadStore();
    store.vocabulary = INITIAL_VOCABULARY_DATA;
    this.saveStore(store);
    return { ...store.vocabulary };
  }

  async addLearningLog(logData: Omit<LearningLog, 'id'>): Promise<LearningLog> {
    const store = this.loadStore();
    const newLog: LearningLog = {
      ...logData,
      id: `log_${Date.now()}_${crypto.randomUUID().substring(0, 8)}`
    };
    store.logs.unshift(newLog);
    this.saveStore(store);
    return newLog;
  }

  async getLearningLogs(filter?: { studentName?: string; gradeClass?: string }): Promise<LearningLog[]> {
    const store = this.loadStore();
    let result = store.logs;

    if (filter?.studentName) {
      const q = filter.studentName.toLowerCase();
      result = result.filter(l => l.studentName.toLowerCase().includes(q));
    }
    if (filter?.gradeClass) {
      const q = filter.gradeClass.toLowerCase();
      result = result.filter(l => l.gradeClass.toLowerCase().includes(q));
    }

    return result;
  }

  async clearLearningLogs(sampleFallback: boolean = false): Promise<void> {
    const store = this.loadStore();
    store.logs = sampleFallback ? this.generateSampleLogs() : [];
    this.saveStore(store);
  }
}
