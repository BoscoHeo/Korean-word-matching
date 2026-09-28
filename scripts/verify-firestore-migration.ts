import fs from 'fs';
import path from 'path';
import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { WordItem, LearningLog } from '../src/types';

export interface VerificationOptions {
  storePath?: string;
  databaseId?: string;
  customDb?: Firestore;
}

export interface VerificationResult {
  json: {
    vocabPagesCount: number;
    vocabWordsCount: number;
    logsCount: number;
    settingsExist: boolean;
    hasPasscodeHash: boolean;
    hasPlaintextPasscode: boolean;
  };
  firestore: {
    vocabPagesCount: number;
    vocabWordsCount: number;
    logsCount: number;
    settingsExist: boolean;
    hasPasscodeHash: boolean;
    hasPlaintextPasscode: boolean;
  };
  integrity: {
    vocabPagesMatch: boolean;
    vocabWordsMatch: boolean;
    logsCountMatch: boolean;
    settingsMatch: boolean;
    plaintextPasscodeZero: boolean;
    allPassed: boolean;
  };
}

function initFirestore(databaseId?: string, customDb?: Firestore): Firestore {
  if (customDb) {
    return customDb;
  }
  let app: App;
  if (!getApps().length) {
    app = initializeApp();
  } else {
    app = getApps()[0]!;
  }
  const dbId = databaseId || process.env.FIRESTORE_DATABASE_ID;
  return dbId ? getFirestore(app, dbId) : getFirestore(app);
}

export async function runVerification(options: VerificationOptions = {}): Promise<VerificationResult> {
  const storeFilePath = options.storePath || process.env.STORE_PATH || path.join(process.cwd(), 'data', 'learning_store.json');

  if (!fs.existsSync(storeFilePath)) {
    throw new Error(`Data store file not found at: ${storeFilePath}`);
  }

  const rawJson = fs.readFileSync(storeFilePath, 'utf-8');
  const store: {
    vocabulary?: Record<string, WordItem[]>;
    logs?: LearningLog[];
    settings?: Record<string, any>;
  } = JSON.parse(rawJson);

  // 1. JSON 통계 산출
  const jsonVocabPages = Object.entries(store.vocabulary || {});
  const jsonVocabPagesCount = jsonVocabPages.length;
  let jsonVocabWordsCount = 0;
  for (const [, words] of jsonVocabPages) {
    jsonVocabWordsCount += Array.isArray(words) ? words.length : 0;
  }
  const jsonLogsCount = (store.logs || []).length;
  const jsonSettingsExist = !!store.settings;
  const jsonHasPasscodeHash = !!(store.settings && store.settings.passcodeHash);
  const jsonHasPlaintextPasscode = !!(store.settings && store.settings.passcode);

  // 2. Firestore 읽기 (READ ONLY)
  const db = initFirestore(options.databaseId, options.customDb);

  // A. Settings 검사
  const settingsSnap = await db.collection('settings').doc('teacher').get();
  const fsSettingsExist = settingsSnap.exists;
  const settingsData = settingsSnap.exists ? settingsSnap.data() || {} : {};
  const fsHasPasscodeHash = !!settingsData.passcodeHash;
  const fsHasPlaintextPasscode = !!settingsData.passcode;

  // B. Vocabulary 검사
  const vocabSnap = await db.collection('vocabulary').get();
  const fsVocabPagesCount = vocabSnap.docs.length;
  let fsVocabWordsCount = 0;
  for (const doc of vocabSnap.docs) {
    const data = doc.data();
    if (Array.isArray(data.words)) {
      fsVocabWordsCount += data.words.length;
    }
  }

  // C. Learning Logs 검사
  const logsSnap = await db.collection('learningLogs').get();
  const fsLogsCount = logsSnap.docs.length;

  // 3. 무결성(Integrity) 판정
  const vocabPagesMatch = jsonVocabPagesCount === fsVocabPagesCount;
  const vocabWordsMatch = jsonVocabWordsCount === fsVocabWordsCount;
  const logsCountMatch = jsonLogsCount === fsLogsCount;
  const settingsMatch = jsonSettingsExist === fsSettingsExist && jsonHasPasscodeHash === fsHasPasscodeHash;
  const plaintextPasscodeZero = !fsHasPlaintextPasscode;

  const allPassed = vocabPagesMatch && vocabWordsMatch && logsCountMatch && settingsMatch && plaintextPasscodeZero;

  return {
    json: {
      vocabPagesCount: jsonVocabPagesCount,
      vocabWordsCount: jsonVocabWordsCount,
      logsCount: jsonLogsCount,
      settingsExist: jsonSettingsExist,
      hasPasscodeHash: jsonHasPasscodeHash,
      hasPlaintextPasscode: jsonHasPlaintextPasscode
    },
    firestore: {
      vocabPagesCount: fsVocabPagesCount,
      vocabWordsCount: fsVocabWordsCount,
      logsCount: fsLogsCount,
      settingsExist: fsSettingsExist,
      hasPasscodeHash: fsHasPasscodeHash,
      hasPlaintextPasscode: fsHasPlaintextPasscode
    },
    integrity: {
      vocabPagesMatch,
      vocabWordsMatch,
      logsCountMatch,
      settingsMatch,
      plaintextPasscodeZero,
      allPassed
    }
  };
}

// CLI 엔트리포인트
if (process.env.NODE_ENV !== 'test' && (process.argv[1]?.endsWith('verify-firestore-migration.ts') || process.argv[1]?.endsWith('verify-firestore-migration.js'))) {
  console.log('====================================================');
  console.log('Firestore Migration Verification (READ-ONLY)');
  console.log('====================================================');

  runVerification()
    .then((result) => {
      console.log('JSON Data vs Firestore Comparison:');
      console.log(`  - Vocabulary Pages:  JSON=${result.json.vocabPagesCount} | Firestore=${result.firestore.vocabPagesCount} [${result.integrity.vocabPagesMatch ? 'MATCH' : 'MISMATCH'}]`);
      console.log(`  - Vocabulary Words:  JSON=${result.json.vocabWordsCount} | Firestore=${result.firestore.vocabWordsCount} [${result.integrity.vocabWordsMatch ? 'MATCH' : 'MISMATCH'}]`);
      console.log(`  - Learning Logs:     JSON=${result.json.logsCount} | Firestore=${result.firestore.logsCount} [${result.integrity.logsCountMatch ? 'MATCH' : 'MISMATCH'}]`);
      console.log(`  - Settings Document: JSON=${result.json.settingsExist} | Firestore=${result.firestore.settingsExist} [${result.integrity.settingsMatch ? 'MATCH' : 'MISMATCH'}]`);
      console.log(`  - Passcode Hash:     JSON=${result.json.hasPasscodeHash} | Firestore=${result.firestore.hasPasscodeHash}`);
      console.log(`  - Plaintext Passcode in Firestore: ${result.firestore.hasPlaintextPasscode ? 'EXISTS (FAIL)' : '0 (SECURE)'}`);
      console.log('====================================================');

      if (result.integrity.allPassed) {
        console.log('\n[PASS] All migration integrity checks passed successfully!');
      } else {
        console.error('\n[FAIL] Some migration integrity checks failed.');
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error('\n[ERROR] Verification failed:', err.message);
      process.exit(1);
    });
}
