import crypto from 'crypto';
import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getFirestore, Firestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { DataRepository, StoredSettings, StoredWordItem } from './repository';
import { LearningLog } from '../src/types';
import { INITIAL_VOCABULARY_DATA } from '../src/data/initialWords.js';
import { hashPinSync } from '../server.js';

export class FirestoreRepository implements DataRepository {
  private db: Firestore;
  private app: App;

  constructor(customDb?: Firestore) {
    if (customDb) {
      this.db = customDb;
      this.app = getApps()[0]!;
      return;
    }

    if (!getApps().length) {
      // Application Default Credentials (ADC) 사용 - 서비스 계정 JSON 키 일체 미사용
      this.app = initializeApp();
    } else {
      this.app = getApps()[0]!;
    }

    const databaseId = process.env.FIRESTORE_DATABASE_ID;
    this.db = databaseId ? getFirestore(this.app, databaseId) : getFirestore(this.app);
  }

  private getDefaultPasscodeHash(): string {
    const initialPin = process.env.TEACHER_INITIAL_PASSCODE || (process.env.NODE_ENV !== 'production' ? '0000' : '');
    return initialPin ? hashPinSync(initialPin) : '';
  }

  // --- Settings ---

  async getSettings(): Promise<StoredSettings> {
    const docRef = this.db.collection('settings').doc('teacher');
    const snap = await docRef.get();

    if (!snap.exists) {
      // 문서가 아직 없을 때: 기본 bootstrap 반환 (자동 쓰기는 DB-4에서 수행)
      return {
        gasUrl: 'https://script.google.com/macros/s/AKfycby7y17aCdMPi_NP6rWl4YXfUckniJLS2H620q0nXw0CEYSejHMTJYn-eFc_dnSruDvS/exec',
        autoSyncGoogleSheets: true,
        passcodeHash: this.getDefaultPasscodeHash()
      };
    }

    const data = snap.data() || {};
    return {
      gasUrl: data.gasUrl || '',
      autoSyncGoogleSheets: data.autoSyncGoogleSheets ?? true,
      passcodeHash: data.passcodeHash || this.getDefaultPasscodeHash()
    };
  }

  async updateSettings(patch: Partial<StoredSettings>): Promise<StoredSettings> {
    const docRef = this.db.collection('settings').doc('teacher');
    const updatePayload: Record<string, any> = {
      ...patch,
      updatedAt: FieldValue.serverTimestamp()
    };
    delete updatePayload.passcode; // legacy plaintext 필드 원천 배제

    await docRef.set(updatePayload, { merge: true });
    return this.getSettings();
  }

  // --- Vocabulary ---

  async getVocabulary(): Promise<Record<string, StoredWordItem[]>> {
    const colRef = this.db.collection('vocabulary');
    const snap = await colRef.get();

    if (snap.empty) {
      // Firestore가 아직 비어 있으면 메모리 fallback으로 기본 어휘 반환 (DB-4 이전 안전 가드)
      return INITIAL_VOCABULARY_DATA;
    }

    const result: Record<string, StoredWordItem[]> = {};
    snap.docs.forEach((doc) => {
      const data = doc.data();
      const pageKey = doc.id.replace(/^page_/, '');
      result[pageKey] = data.words || [];
    });

    return Object.keys(result).length > 0 ? result : INITIAL_VOCABULARY_DATA;
  }

  async saveVocabularyPage(pageName: string, words: StoredWordItem[]): Promise<Record<string, StoredWordItem[]>> {
    const cleanKey = pageName.replace(/^page_/, '');
    const docId = `page_${cleanKey}`;
    const docRef = this.db.collection('vocabulary').doc(docId);

    await docRef.set({
      pageName,
      words,
      updatedAt: FieldValue.serverTimestamp()
    });

    return this.getVocabulary();
  }

  async resetVocabulary(): Promise<Record<string, StoredWordItem[]>> {
    // 기본 교재 1~13쪽 데이터를 Firestore에 배치로 복원
    const batch = this.db.batch();
    for (const [pageKey, words] of Object.entries(INITIAL_VOCABULARY_DATA)) {
      const docRef = this.db.collection('vocabulary').doc(`page_${pageKey}`);
      batch.set(docRef, {
        pageName: pageKey,
        words,
        updatedAt: FieldValue.serverTimestamp()
      });
    }
    await batch.commit();
    return INITIAL_VOCABULARY_DATA;
  }

  // --- Learning Logs ---

  async addLearningLog(logData: Omit<LearningLog, 'id'>): Promise<LearningLog> {
    const logId = `log_${Date.now()}_${crypto.randomUUID().substring(0, 8)}`;
    const docRef = this.db.collection('learningLogs').doc(logId);

    const docPayload = {
      ...logData,
      id: logId,
      createdAt: FieldValue.serverTimestamp()
    };

    await docRef.set(docPayload);

    // 클라이언트 반환용 (Timestamp 객체 대신 순수 ISO 문자열 유지)
    return {
      ...logData,
      id: logId,
      timestamp: logData.timestamp || new Date().toISOString()
    };
  }

  async getLearningLogs(filter?: { studentName?: string; gradeClass?: string }): Promise<LearningLog[]> {
    let query: FirebaseFirestore.Query = this.db.collection('learningLogs');

    // 필터링 적용
    if (filter?.studentName) {
      query = query.where('studentName', '==', filter.studentName.trim());
    }
    if (filter?.gradeClass) {
      query = query.where('gradeClass', '==', filter.gradeClass.trim());
    }

    const snap = await query.get();
    const logs: LearningLog[] = [];

    snap.docs.forEach((doc) => {
      const data = doc.data();
      let tsStr = data.timestamp;
      if (!tsStr && data.createdAt instanceof Timestamp) {
        tsStr = data.createdAt.toDate().toISOString();
      }

      logs.push({
        id: data.id || doc.id,
        studentName: data.studentName || '익명 학생',
        gradeClass: data.gradeClass || '',
        pages: data.pages || [],
        totalWords: Number(data.totalWords) || 0,
        completedWords: Number(data.completedWords) || 0,
        score: Number(data.score) || 0,
        timeElapsed: Number(data.timeElapsed) || 0,
        accuracy: Number(data.accuracy) || 0,
        wrongAttemptsCount: Number(data.wrongAttemptsCount) || 0,
        wrongWords: data.wrongWords || [],
        timestamp: tsStr || new Date().toISOString(),
        mode: data.mode || 'standard'
      });
    });

    // 최신순 정렬 (timestamp 기준)
    return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  async clearLearningLogs(): Promise<void> {
    const snap = await this.db.collection('learningLogs').limit(500).get();
    if (snap.empty) return;

    const batch = this.db.batch();
    snap.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();
  }
}
