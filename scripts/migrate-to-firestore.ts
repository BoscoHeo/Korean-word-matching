import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getFirestore, Firestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { LearningLog, WordItem } from '../src/types';

interface StoredData {
  vocabulary?: Record<string, WordItem[]>;
  logs?: LearningLog[];
  settings?: Record<string, any>;
}

export interface MigrationOptions {
  apply: boolean;
  storePath?: string;
  databaseId?: string;
  customDb?: Firestore;
}

export interface MigrationReport {
  projectConfigured: boolean;
  databaseId: string;
  mode: 'DRY-RUN' | 'APPLY';
  vocabPagesCount: number;
  vocabWordsCount: number;
  logsCount: number;
  settingsCount: number;
  plannedCreates: {
    settings: number;
    vocabulary: number;
    learningLogs: number;
  };
  skippedCount: number;
  conflictsCount: number;
  plaintextSensitiveFieldsExcluded: number;
  actualWrites: number;
}

function initFirestore(databaseId?: string, customDb?: Firestore): { db: Firestore; isConfigured: boolean } {
  if (customDb) {
    return { db: customDb, isConfigured: true };
  }

  let app: App;
  if (!getApps().length) {
    app = initializeApp();
  } else {
    app = getApps()[0]!;
  }

  const dbId = databaseId || process.env.FIRESTORE_DATABASE_ID;
  const db = dbId ? getFirestore(app, dbId) : getFirestore(app);
  return { db, isConfigured: true };
}

export function generateDeterministicLogId(log: any): string {
  const hashSource = `${log.timestamp || ''}_${log.score || 0}_${log.totalWords || 0}_${log.completedWords || 0}_${log.accuracy || 0}_${log.timeElapsed || 0}_${log.mode || ''}`;
  const hash = crypto.createHash('sha256').update(hashSource).digest('hex').substring(0, 16);
  return `log_det_${hash}`;
}

export async function runMigration(options: MigrationOptions): Promise<MigrationReport> {
  const isApply = options.apply;
  const storeFilePath = options.storePath || process.env.STORE_PATH || path.join(process.cwd(), 'data', 'learning_store.json');

  if (!fs.existsSync(storeFilePath)) {
    throw new Error(`Data store file not found at: ${storeFilePath}`);
  }

  const rawJson = fs.readFileSync(storeFilePath, 'utf-8');
  const store: StoredData = JSON.parse(rawJson);

  let db: Firestore | null = null;
  let isConfigured = false;
  try {
    const initialized = initFirestore(options.databaseId, options.customDb);
    db = initialized.db;
    isConfigured = initialized.isConfigured;
  } catch (err: any) {
    // dry-run 시 GCP 설정이 없어도 분석은 계속 진행 가능
    if (isApply) {
      throw new Error(`Failed to initialize Firestore for migration apply: ${err.message}`);
    }
  }

  const report: MigrationReport = {
    projectConfigured: isConfigured,
    databaseId: options.databaseId || process.env.FIRESTORE_DATABASE_ID || '(default)',
    mode: isApply ? 'APPLY' : 'DRY-RUN',
    vocabPagesCount: 0,
    vocabWordsCount: 0,
    logsCount: 0,
    settingsCount: 0,
    plannedCreates: {
      settings: 0,
      vocabulary: 0,
      learningLogs: 0
    },
    skippedCount: 0,
    conflictsCount: 0,
    plaintextSensitiveFieldsExcluded: 0,
    actualWrites: 0
  };

  // 1. Settings 분석
  let settingsDocPayload: Record<string, any> | null = null;
  if (store.settings && typeof store.settings === 'object') {
    report.settingsCount = 1;
    settingsDocPayload = {};

    if (store.settings.gasUrl !== undefined) {
      settingsDocPayload.gasUrl = store.settings.gasUrl;
    }
    if (store.settings.autoSyncGoogleSheets !== undefined) {
      settingsDocPayload.autoSyncGoogleSheets = store.settings.autoSyncGoogleSheets;
    }
    if (store.settings.passcodeHash) {
      settingsDocPayload.passcodeHash = store.settings.passcodeHash;
    }

    // 평문 passcode 검사 및 원천 배제
    if (store.settings.passcode) {
      report.plaintextSensitiveFieldsExcluded++;
    }

    // 기존 Firestore 문서 존재 여부 확인 (conflict 방지)
    if (db) {
      try {
        const settingsRef = db.collection('settings').doc('teacher');
        const snap = await settingsRef.get();
        if (snap.exists) {
          report.conflictsCount++;
          report.skippedCount++;
        } else {
          report.plannedCreates.settings = 1;
        }
      } catch {
        report.plannedCreates.settings = 1;
      }
    } else {
      report.plannedCreates.settings = 1;
    }
  }

  // 2. Vocabulary 분석
  const vocabPages = Object.entries(store.vocabulary || {});
  report.vocabPagesCount = vocabPages.length;
  for (const [, words] of vocabPages) {
    report.vocabWordsCount += Array.isArray(words) ? words.length : 0;
  }

  const vocabToCreate: Array<{ docId: string; pageName: string; words: any[] }> = [];
  for (const [pageKey, words] of vocabPages) {
    const cleanKey = pageKey.replace(/^page_/, '');
    const docId = `page_${cleanKey}`;

    if (db) {
      try {
        const docRef = db.collection('vocabulary').doc(docId);
        const snap = await docRef.get();
        if (snap.exists) {
          report.conflictsCount++;
          report.skippedCount++;
          continue;
        }
      } catch {}
    }

    vocabToCreate.push({
      docId,
      pageName: pageKey,
      words: Array.isArray(words) ? words : []
    });
    report.plannedCreates.vocabulary++;
  }

  // 3. Learning Logs 분석
  const logs = store.logs || [];
  report.logsCount = logs.length;

  const logsToCreate: Array<{ docId: string; payload: any }> = [];
  for (const log of logs) {
    const docId = log.id && typeof log.id === 'string' && log.id.trim() ? log.id.trim() : generateDeterministicLogId(log);

    if (db) {
      try {
        const docRef = db.collection('learningLogs').doc(docId);
        const snap = await docRef.get();
        if (snap.exists) {
          report.conflictsCount++;
          report.skippedCount++;
          continue;
        }
      } catch {}
    }

    let createdAtVal: any;
    if (log.timestamp && !isNaN(Date.parse(log.timestamp))) {
      createdAtVal = Timestamp.fromDate(new Date(log.timestamp));
    } else {
      createdAtVal = FieldValue.serverTimestamp();
    }

    const payload = {
      ...log,
      id: docId,
      createdAt: createdAtVal
    };

    logsToCreate.push({ docId, payload });
    report.plannedCreates.learningLogs++;
  }

  // 4. --apply 모드 실행 (Batch write)
  if (isApply && db) {
    let totalWrites = 0;
    const BATCH_SIZE = 400;

    // A. Settings write
    if (settingsDocPayload && report.plannedCreates.settings > 0) {
      const settingsRef = db.collection('settings').doc('teacher');
      await settingsRef.set({
        ...settingsDocPayload,
        updatedAt: FieldValue.serverTimestamp()
      });
      totalWrites++;
    }

    // B. Vocabulary write
    if (vocabToCreate.length > 0) {
      for (let i = 0; i < vocabToCreate.length; i += BATCH_SIZE) {
        const batch = db.batch();
        const chunk = vocabToCreate.slice(i, i + BATCH_SIZE);
        for (const item of chunk) {
          const docRef = db.collection('vocabulary').doc(item.docId);
          batch.set(docRef, {
            pageName: item.pageName,
            words: item.words,
            updatedAt: FieldValue.serverTimestamp()
          });
        }
        await batch.commit();
        totalWrites += chunk.length;
      }
    }

    // C. Learning Logs write
    if (logsToCreate.length > 0) {
      for (let i = 0; i < logsToCreate.length; i += BATCH_SIZE) {
        const batch = db.batch();
        const chunk = logsToCreate.slice(i, i + BATCH_SIZE);
        for (const item of chunk) {
          const docRef = db.collection('learningLogs').doc(item.docId);
          batch.set(docRef, item.payload);
        }
        await batch.commit();
        totalWrites += chunk.length;
      }
    }

    report.actualWrites = totalWrites;
  }

  return report;
}

// CLI 실행 엔트리포인트
if (process.env.NODE_ENV !== 'test' && (process.argv[1]?.endsWith('migrate-to-firestore.ts') || process.argv[1]?.endsWith('migrate-to-firestore.js'))) {
  const args = process.argv.slice(2);
  const isApply = args.includes('--apply');

  console.log('====================================================');
  console.log(`Firestore Migration Tool (${isApply ? 'APPLY MODE' : 'DRY-RUN MODE'})`);
  console.log('====================================================');

  runMigration({ apply: isApply })
    .then((report) => {
      console.log(`Project configured: ${report.projectConfigured ? 'yes' : 'no'}`);
      console.log(`Database ID: ${report.databaseId}`);
      console.log(`Mode: ${report.mode}`);
      console.log(`Vocabulary pages: ${report.vocabPagesCount}`);
      console.log(`Vocabulary words: ${report.vocabWordsCount}`);
      console.log(`Learning logs: ${report.logsCount}`);
      console.log(`Settings documents: ${report.settingsCount}`);
      console.log('\nPlanned creates:');
      console.log(`  - settings: ${report.plannedCreates.settings}`);
      console.log(`  - vocabulary: ${report.plannedCreates.vocabulary}`);
      console.log(`  - learning logs: ${report.plannedCreates.learningLogs}`);
      console.log(`\nSkipped (existing/conflict): ${report.skippedCount}`);
      console.log(`Conflicts: ${report.conflictsCount}`);
      console.log(`Plaintext sensitive fields excluded: ${report.plaintextSensitiveFieldsExcluded}`);
      console.log(`Actual writes: ${report.actualWrites}`);
      console.log('====================================================');

      if (!isApply) {
        console.log('\n[NOTICE] This was a DRY-RUN. 0 writes were performed to Firestore.');
        console.log('To perform the actual migration, run with the --apply flag.');
      } else {
        console.log(`\n[SUCCESS] Migration completed with ${report.actualWrites} documents created.`);
      }
    })
    .catch((err) => {
      console.error('\n[ERROR] Migration failed:', err.message);
      process.exit(1);
    });
}
