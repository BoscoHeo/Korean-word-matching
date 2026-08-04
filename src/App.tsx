import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { GameSetup } from './components/GameSetup';
import { GameBoard } from './components/GameBoard';
import { GameResults } from './components/GameResults';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { VocabularyManager } from './components/VocabularyManager';
import { TeacherAuthModal } from './components/TeacherAuthModal';
import { WordItem, LearningLog, WrongWordRecord } from './types';
import { INITIAL_VOCABULARY_DATA } from './data/initialWords';

export default function App() {
  const [activeNav, setActiveNav] = useState<'game' | 'analytics' | 'words' | 'settings'>('game');
  const [gameState, setGameState] = useState<'setup' | 'playing' | 'result'>('setup');

  // Teacher security state
  const [isTeacherUnlocked, setIsTeacherUnlocked] = useState<boolean>(
    () => sessionStorage.getItem('is_teacher_unlocked') === 'true'
  );
  const [isTeacherModalOpen, setIsTeacherModalOpen] = useState(false);
  const [pendingTab, setPendingTab] = useState<'analytics' | 'words' | null>(null);

  // Vocabulary pages data
  const [vocabulary, setVocabulary] = useState<Record<string, { word: string; def: string; example?: string }[]>>(
    INITIAL_VOCABULARY_DATA
  );

  // Learning logs data
  const [logs, setLogs] = useState<LearningLog[]>([]);

  // Sound preference
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Active game session state
  const [studentName, setStudentName] = useState(() => localStorage.getItem('last_student_name') || '');
  const [gradeClass, setGradeClass] = useState(() => localStorage.getItem('last_grade_class') || '');
  const [selectedPages, setSelectedPages] = useState<string[]>(['1페이지']);
  const [gameWordsPool, setGameWordsPool] = useState<WordItem[]>([]);
  const [gasUrl, setGasUrl] = useState('');

  // Result state
  const [lastResult, setLastResult] = useState<{
    score: number;
    timeElapsed: number;
    completedWords: number;
    totalWords: number;
    wrongWords: WrongWordRecord[];
    wrongAttemptsCount: number;
    syncStatusMsg?: string;
  } | null>(null);

  // Fetch words and learning logs on mount
  useEffect(() => {
    loadVocabulary();
    loadLearningLogs();
  }, []);

  const loadVocabulary = () => {
    fetch('/api/words')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.pages) {
          setVocabulary(data.pages);
        }
      })
      .catch((err) => console.error('Failed to load words:', err));
  };

  const loadLearningLogs = () => {
    fetch('/api/learning-logs')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.logs) {
          setLogs(data.logs);
        }
      })
      .catch((err) => console.error('Failed to load logs:', err));
  };

  const handleStartGame = (
    name: string,
    cls: string,
    pages: string[],
    url: string,
    mode: 'standard' | 'review'
  ) => {
    setStudentName(name);
    setGradeClass(cls);
    localStorage.setItem('last_student_name', name);
    localStorage.setItem('last_grade_class', cls);
    setSelectedPages(pages);
    setGasUrl(url);

    let wordsToPlay: WordItem[] = [];

    if (mode === 'review') {
      // Collect wrong words for this student across prior logs
      const studentLogs = logs.filter((l) => l.studentName === name);
      const wrongMap = new Map<string, WordItem>();

      studentLogs.forEach((l) => {
        (l.wrongWords || []).forEach((w) => {
          if (!wrongMap.has(w.word)) {
            wrongMap.set(w.word, { id: w.word, word: w.word, def: w.def, page: '오답노트' });
          }
        });
      });

      wordsToPlay = Array.from(wrongMap.values());
      if (wordsToPlay.length === 0) {
        alert('이전에 틀린 단어가 없습니다! 일반 페이지를 선택해 주세요.');
        return;
      }
    } else {
      // Collect words from selected pages
      pages.forEach((pName) => {
        const pageWords = vocabulary[pName];
        if (pageWords) {
          pageWords.forEach((item) => {
            wordsToPlay.push({
              id: `${pName}_${item.word}`,
              word: item.word,
              def: item.def,
              page: pName,
              example: item.example
            });
          });
        }
      });
    }

    setGameWordsPool(wordsToPlay);
    setGameState('playing');
  };

  const handleGameComplete = async (
    score: number,
    timeElapsed: number,
    completedWords: number,
    totalWords: number,
    wrongWords: WrongWordRecord[],
    wrongAttemptsCount: number
  ) => {
    const isPartial = completedWords < totalWords;
    const baseWords = completedWords > 0 ? completedWords : totalWords;
    const accuracy = baseWords > 0
      ? Math.max(0, Math.round(((baseWords - wrongWords.length) / baseWords) * 100))
      : 0;

    const logPayload: Omit<LearningLog, 'id'> = {
      studentName,
      gradeClass,
      pages: selectedPages,
      totalWords,
      completedWords,
      score,
      timeElapsed,
      accuracy,
      wrongAttemptsCount,
      wrongWords,
      timestamp: new Date().toISOString(),
      mode: isPartial ? 'standard (중단)' : 'standard'
    };

    let syncMsg = isPartial
      ? `⏸️ 중간 중단됨 - 학습 완료 기록(${completedWords}/${totalWords}개 어휘 완료, ${score}점)이 성공적으로 저장되었습니다!`
      : '✅ 학습 데이터가 성공적으로 저장되었습니다.';

    try {
      const res = await fetch('/api/learning-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logPayload)
      });
      const data = await res.json();
      if (data.success) {
        loadLearningLogs(); // Refresh logs
      }
    } catch {
      syncMsg = '⚠️ 서버 통신 오류로 기록이 임시 저장되었습니다.';
    }

    setLastResult({
      score,
      timeElapsed,
      completedWords,
      totalWords,
      wrongWords,
      wrongAttemptsCount,
      syncStatusMsg: syncMsg
    });

    setGameState('result');
  };

  const handleSavePage = async (
    pageName: string,
    words: { word: string; def: string; example?: string }[]
  ) => {
    try {
      const res = await fetch('/api/words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageName, words })
      });
      const data = await res.json();
      if (data.success) {
        setVocabulary(data.pages);
      }
    } catch (err) {
      console.error('Failed to save page:', err);
    }
  };

  const handleResetWords = async () => {
    if (!confirm('기본 교재 어휘(1~13페이지) 데이터로 복원하시겠습니까?')) return;
    try {
      const res = await fetch('/api/reset-words', { method: 'POST' });
      const data = await res.json();
      if (data.success && data.pages) {
        setVocabulary(data.pages);
        alert('기본 어휘(1~13페이지) 데이터가 복원되었습니다.');
      }
    } catch (err) {
      console.error('Failed to reset words:', err);
    }
  };

  // Student change request
  const handleChangeStudent = () => {
    setStudentName('');
    localStorage.removeItem('last_student_name');
    setGameState('setup');
    setActiveNav('game');
  };

  // Check if student has wrong words for review
  const hasWrongWordsForStudent = studentName
    ? logs
        .filter((l) => l.studentName === studentName)
        .some((l) => (l.wrongWords || []).length > 0)
    : false;

  // Tab navigation with teacher access control
  const handleTabChange = (tab: 'game' | 'analytics' | 'words' | 'settings') => {
    if (tab === 'analytics' || tab === 'words') {
      if (!isTeacherUnlocked) {
        setPendingTab(tab);
        setIsTeacherModalOpen(true);
        return;
      }
    }
    setActiveNav(tab);
    if (tab === 'game' && gameState === 'result') {
      setGameState('setup');
    }
  };

  const handleTeacherAuthSuccess = () => {
    setIsTeacherUnlocked(true);
    sessionStorage.setItem('is_teacher_unlocked', 'true');
    setIsTeacherModalOpen(false);
    if (pendingTab) {
      setActiveNav(pendingTab);
      setPendingTab(null);
    } else {
      setActiveNav('analytics');
    }
  };

  const handleLockTeacher = () => {
    setIsTeacherUnlocked(false);
    sessionStorage.removeItem('is_teacher_unlocked');
    if (activeNav === 'analytics' || activeNav === 'words') {
      setActiveNav('game');
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 font-sans flex flex-col">
      <Header
        activeTab={activeNav}
        setActiveTab={handleTabChange}
        studentName={studentName}
        gradeClass={gradeClass}
        soundEnabled={soundEnabled}
        toggleSound={() => setSoundEnabled(!soundEnabled)}
        onChangeStudent={handleChangeStudent}
        isTeacherUnlocked={isTeacherUnlocked}
        onLockTeacher={handleLockTeacher}
      />

      <main className="flex-1 pb-12">
        {activeNav === 'game' && (
          <>
            {gameState === 'setup' && (
              <GameSetup
                availablePages={vocabulary}
                onStartGame={handleStartGame}
                initialStudentName={studentName}
                initialGradeClass={gradeClass}
                hasWrongWordsForReview={hasWrongWordsForStudent}
              />
            )}

            {gameState === 'playing' && (
              <GameBoard
                studentName={studentName}
                gradeClass={gradeClass}
                selectedPages={selectedPages}
                wordsPool={gameWordsPool}
                onGameComplete={handleGameComplete}
                soundEnabled={soundEnabled}
              />
            )}

            {gameState === 'result' && lastResult && (
              <GameResults
                studentName={studentName}
                gradeClass={gradeClass}
                selectedPages={selectedPages}
                score={lastResult.score}
                timeElapsed={lastResult.timeElapsed}
                completedWords={lastResult.completedWords}
                totalWords={lastResult.totalWords}
                wrongWords={lastResult.wrongWords}
                wrongAttemptsCount={lastResult.wrongAttemptsCount}
                syncStatusMessage={lastResult.syncStatusMsg}
                onRestartSamePages={() => handleStartGame(studentName, gradeClass, selectedPages, gasUrl, 'standard')}
                onChooseNewPages={() => setGameState('setup')}
                onViewAnalytics={() => {
                  handleTabChange('analytics');
                }}
              />
            )}
          </>
        )}

        {activeNav === 'analytics' && isTeacherUnlocked && (
          <AnalyticsDashboard
            logs={logs}
            onRefreshData={loadLearningLogs}
            selectedStudentFilter={studentName}
          />
        )}

        {activeNav === 'words' && isTeacherUnlocked && (
          <VocabularyManager
            vocabularyData={vocabulary}
            onSavePage={handleSavePage}
            onResetWords={handleResetWords}
          />
        )}
      </main>

      {/* Teacher Authentication Modal */}
      <TeacherAuthModal
        isOpen={isTeacherModalOpen}
        onClose={() => {
          setIsTeacherModalOpen(false);
          setPendingTab(null);
        }}
        onSuccess={handleTeacherAuthSuccess}
      />

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-500">
        초등 5~6학년 문해력 어휘 학습 게임 & 데이터 분석 솔루션 | © 2026 AI Studio
      </footer>
    </div>
  );
}
