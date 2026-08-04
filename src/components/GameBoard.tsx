import React, { useState, useEffect, useRef } from 'react';
import { GameCard, WordItem, WrongWordRecord } from '../types';
import { soundManager } from '../utils/sound';
import { Timer, Award, CheckCircle2, Lightbulb, Flame, AlertCircle, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface GameBoardProps {
  studentName: string;
  gradeClass: string;
  selectedPages: string[];
  wordsPool: WordItem[];
  onGameComplete: (
    score: number,
    timeElapsed: number,
    completedWords: number,
    totalWords: number,
    wrongWords: WrongWordRecord[],
    wrongAttemptsCount: number
  ) => void;
  soundEnabled: boolean;
}

export const GameBoard: React.FC<GameBoardProps> = ({
  studentName,
  gradeClass,
  selectedPages,
  wordsPool,
  onGameComplete,
  soundEnabled
}) => {
  const [remainingPool, setRemainingPool] = useState<WordItem[]>([]);
  const [currentRoundWords, setCurrentRoundWords] = useState<WordItem[]>([]);
  const [cards, setCards] = useState<GameCard[]>([]);
  const [selectedCards, setSelectedCards] = useState<GameCard[]>([]);
  const [matchedCardIds, setMatchedCardIds] = useState<string[]>([]);
  
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [completedWordsCount, setCompletedWordsCount] = useState(0);
  const [totalWordsCount, setTotalWordsCount] = useState(0);

  // Tracking wrong matches per word
  const [wrongWordMap, setWrongWordMap] = useState<Record<string, { def: string; count: number }>>({});
  const [totalWrongAttempts, setTotalWrongAttempts] = useState(0);

  // Hint control
  const [hintActive, setHintActive] = useState(false);
  const [shakingCards, setShakingCards] = useState<string[]>([]);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Progress ref for auto-saving on page unload/close
  const progressRef = useRef({
    studentName,
    gradeClass,
    selectedPages,
    score,
    timeElapsed,
    completedWordsCount,
    totalWordsCount,
    wrongWordMap,
    totalWrongAttempts,
    hasSaved: false
  });

  useEffect(() => {
    progressRef.current = {
      studentName,
      gradeClass,
      selectedPages,
      score,
      timeElapsed,
      completedWordsCount,
      totalWordsCount,
      wrongWordMap,
      totalWrongAttempts,
      hasSaved: progressRef.current.hasSaved
    };
  }, [studentName, gradeClass, selectedPages, score, timeElapsed, completedWordsCount, totalWordsCount, wrongWordMap, totalWrongAttempts]);

  // Auto-save on page close or tab hidden
  useEffect(() => {
    const saveProgressOnUnload = () => {
      const cur = progressRef.current;
      if (cur.hasSaved) return;
      // Do not save if no progress at all
      if (cur.completedWordsCount === 0 && cur.totalWrongAttempts === 0 && cur.timeElapsed < 2) return;

      cur.hasSaved = true;

      const wrongWordsList: WrongWordRecord[] = Object.entries(cur.wrongWordMap).map(([w, data]: [string, { def: string; count: number }]) => ({
        word: w,
        def: data.def,
        wrongMatchesCount: data.count
      }));

      const baseWords = cur.completedWordsCount > 0 ? cur.completedWordsCount : cur.totalWordsCount;
      const accuracy = baseWords > 0
        ? Math.max(0, Math.round(((baseWords - wrongWordsList.length) / baseWords) * 100))
        : 0;

      const logPayload = {
        studentName: cur.studentName,
        gradeClass: cur.gradeClass,
        pages: cur.selectedPages,
        totalWords: cur.totalWordsCount,
        completedWords: cur.completedWordsCount,
        score: cur.score,
        timeElapsed: cur.timeElapsed,
        accuracy,
        wrongAttemptsCount: cur.totalWrongAttempts,
        wrongWords: wrongWordsList,
        timestamp: new Date().toISOString(),
        mode: cur.completedWordsCount < cur.totalWordsCount ? 'standard (중단)' : 'standard'
      };

      const blob = new Blob([JSON.stringify(logPayload)], { type: 'application/json' });
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/learning-logs', blob);
      } else {
        fetch('/api/learning-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(logPayload),
          keepalive: true
        });
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveProgressOnUnload();
      }
    };

    window.addEventListener('beforeunload', saveProgressOnUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', saveProgressOnUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Initialize Game Session
  useEffect(() => {
    soundManager.setSoundEnabled(soundEnabled);
    const shuffledPool = [...wordsPool].sort(() => Math.random() - 0.5);
    setRemainingPool(shuffledPool);
    setTotalWordsCount(wordsPool.length);
    setCompletedWordsCount(0);
    setScore(0);
    setCombo(0);
    setTimeElapsed(0);
    setWrongWordMap({});
    setTotalWrongAttempts(0);
    progressRef.current.hasSaved = false;

    // Timer interval
    timerRef.current = setInterval(() => {
      setTimeElapsed((prev) => prev + 1);
    }, 1000);

    setupRound(shuffledPool);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [wordsPool]);

  useEffect(() => {
    soundManager.setSoundEnabled(soundEnabled);
  }, [soundEnabled]);

  // Round setup (max 6 words per round = 12 cards)
  const setupRound = (pool: WordItem[]) => {
    if (pool.length === 0) {
      finishGame();
      return;
    }

    const roundSize = Math.min(6, pool.length);
    const roundWords = pool.slice(0, roundSize);
    const nextPool = pool.slice(roundSize);

    setCurrentRoundWords(roundWords);
    setRemainingPool(nextPool);
    setMatchedCardIds([]);
    setSelectedCards([]);

    // Generate Cards
    const cardList: GameCard[] = [];
    roundWords.forEach((item) => {
      cardList.push({
        cardId: `word_${item.word}_${Math.random()}`,
        wordId: item.word,
        type: 'word',
        text: item.word
      });
      cardList.push({
        cardId: `def_${item.word}_${Math.random()}`,
        wordId: item.word,
        type: 'def',
        text: item.def
      });
    });

    // Shuffle cards
    setCards(cardList.sort(() => Math.random() - 0.5));
  };

  const handleCardClick = (card: GameCard) => {
    if (
      matchedCardIds.includes(card.cardId) ||
      selectedCards.some((c) => c.cardId === card.cardId) ||
      selectedCards.length >= 2
    ) {
      return;
    }

    soundManager.playClick();
    const newSelected = [...selectedCards, card];
    setSelectedCards(newSelected);

    if (newSelected.length === 2) {
      const [card1, card2] = newSelected;

      // Check match: Same wordId and different card types (one word, one def)
      if (card1.wordId === card2.wordId && card1.type !== card2.type) {
        // MATCH SUCCESS
        soundManager.playCorrect();
        const newMatched = [...matchedCardIds, card1.cardId, card2.cardId];
        setMatchedCardIds(newMatched);

        const newCombo = combo + 1;
        setCombo(newCombo);
        const comboBonus = (newCombo - 1) * 20;
        const addScore = 100 + comboBonus;
        setScore((prev) => prev + addScore);

        const newCompleted = completedWordsCount + 1;
        setCompletedWordsCount(newCompleted);

        setSelectedCards([]);

        // Check if all cards in current round matched
        if (newMatched.length === cards.length) {
          setTimeout(() => {
            if (remainingPool.length > 0) {
              setupRound(remainingPool);
            } else {
              finishGame();
            }
          }, 400);
        }
      } else {
        // MATCH FAILURE
        soundManager.playWrong();
        setCombo(0);
        setTotalWrongAttempts((prev) => prev + 1);

        // Record wrong word for wrong answer note
        const targetWordObj = currentRoundWords.find((w) => w.word === card1.wordId || w.word === card2.wordId);
        if (targetWordObj) {
          setWrongWordMap((prev) => ({
            ...prev,
            [targetWordObj.word]: {
              def: targetWordObj.def,
              count: (prev[targetWordObj.word]?.count || 0) + 1
            }
          }));
        }

        // Shake animation
        setShakingCards([card1.cardId, card2.cardId]);

        setTimeout(() => {
          setSelectedCards([]);
          setShakingCards([]);
        }, 500);
      }
    }
  };

  const finishGame = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    soundManager.playVictory();
    progressRef.current.hasSaved = true;

    const wrongWordsList: WrongWordRecord[] = Object.entries(wrongWordMap).map(([w, data]: [string, { def: string; count: number }]) => ({
      word: w,
      def: data.def,
      wrongMatchesCount: data.count
    }));

    onGameComplete(score, timeElapsed, totalWordsCount, totalWordsCount, wrongWordsList, totalWrongAttempts);
  };

  const handleQuitAndSave = () => {
    const confirmMsg = completedWordsCount > 0 || totalWrongAttempts > 0
      ? `현재까지 학습한 내용을 저장하고 종료하시겠습니까?\n\n• 완료 어휘: ${completedWordsCount} / ${totalWordsCount}개\n• 획득 점수: ${score}점\n• 소요 시간: ${timeElapsed}초`
      : `아직 어휘를 완료하지 않았습니다. 학습을 중단하고 기록을 저장하시겠습니까?`;

    if (confirm(confirmMsg)) {
      if (timerRef.current) clearInterval(timerRef.current);
      progressRef.current.hasSaved = true;

      const wrongWordsList: WrongWordRecord[] = Object.entries(wrongWordMap).map(([w, data]: [string, { def: string; count: number }]) => ({
        word: w,
        def: data.def,
        wrongMatchesCount: data.count
      }));

      onGameComplete(score, timeElapsed, completedWordsCount, totalWordsCount, wrongWordsList, totalWrongAttempts);
    }
  };

  // Hint feature: Highlights one matching pair briefly
  const handleUseHint = () => {
    if (hintActive) return;

    // Find unmatched word in current round
    const unmatchedCard = cards.find((c) => !matchedCardIds.includes(c.cardId));
    if (!unmatchedCard) return;

    const matchingPair = cards.filter(
      (c) => c.wordId === unmatchedCard.wordId && !matchedCardIds.includes(c.cardId)
    );

    setHintActive(true);
    setSelectedCards(matchingPair);

    // Deduct 20 points penalty for hint
    setScore((prev) => Math.max(0, prev - 20));

    setTimeout(() => {
      setSelectedCards([]);
      setHintActive(false);
    }, 1200);
  };

  const progressPercent = totalWordsCount > 0 ? Math.round((completedWordsCount / totalWordsCount) * 100) : 0;

  return (
    <div className="max-w-5xl mx-auto py-4 px-4">
      {/* Top Status Dashboard */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 sm:p-5 mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm font-bold text-slate-800">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-blue-100 text-blue-900 rounded-lg">
              👤 {studentName} {gradeClass && `(${gradeClass})`}
            </span>
            <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-lg">
              📖 {selectedPages.join(', ')}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-slate-700 bg-slate-100 px-3 py-1 rounded-lg">
              <Timer className="w-4 h-4 text-blue-600" />
              <span>시간: <strong className="text-blue-700">{timeElapsed}초</strong></span>
            </div>

            <div className="flex items-center gap-1.5 bg-amber-50 text-amber-900 border border-amber-200 px-3 py-1 rounded-lg">
              <Award className="w-4 h-4 text-amber-600" />
              <span>점수: <strong className="text-amber-700">{score}점</strong></span>
            </div>

            {combo > 1 && (
              <div className="flex items-center gap-1 bg-rose-500 text-white px-2.5 py-1 rounded-lg animate-bounce text-xs font-black">
                <Flame className="w-3.5 h-3.5 fill-current" />
                <span>{combo}연속 콤보!</span>
              </div>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-4">
          <div className="flex justify-between items-center text-xs font-bold text-slate-600 mb-1.5">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>진행률 ({completedWordsCount} / {totalWordsCount} 어휘 완료)</span>
            </span>
            <span className="text-emerald-700 font-extrabold">{progressPercent}%</span>
          </div>
          <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden border border-slate-200">
            <div
              className="bg-gradient-to-r from-emerald-500 to-teal-500 h-full transition-all duration-300 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Control Bar & Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <p className="text-xs sm:text-sm font-semibold text-slate-600">
          💡 단어 카드와 어휘의 알맞은 뜻 카드를 선택하여 짝을 맞춰보세요!
        </p>

        <div className="flex items-center gap-2">
          <button
            onClick={handleUseHint}
            disabled={hintActive || score < 20}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
          >
            <Lightbulb className="w-4 h-4 text-amber-600 fill-amber-400" />
            <span>힌트 (-20점)</span>
          </button>

          <button
            onClick={handleQuitAndSave}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 rounded-xl text-xs font-bold transition-all"
            title="현재까지 학습한 내용을 저장하고 종료합니다"
          >
            <LogOut className="w-4 h-4 text-rose-600" />
            <span>중단 및 기록 저장</span>
          </button>
        </div>
      </div>

      {/* Cards Board Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4 min-h-[380px]">
        <AnimatePresence>
          {cards.map((card) => {
            const isMatched = matchedCardIds.includes(card.cardId);
            const isSelected = selectedCards.some((c) => c.cardId === card.cardId);
            const isShaking = shakingCards.includes(card.cardId);

            if (isMatched) {
              return (
                <div key={card.cardId} className="opacity-0 pointer-events-none transition-opacity duration-300 min-h-[100px]" />
              );
            }

            return (
              <motion.div
                key={card.cardId}
                layout
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{
                  scale: isShaking ? [1, 1.05, 0.95, 1.05, 1] : 1,
                  opacity: 1
                }}
                transition={{ duration: 0.2 }}
                onClick={() => handleCardClick(card)}
                className={`group relative rounded-2xl p-4 sm:p-5 flex flex-col items-center justify-center text-center cursor-pointer select-none transition-all duration-200 min-h-[110px] shadow-sm ${
                  isSelected
                    ? 'bg-amber-500 text-white ring-4 ring-amber-300 shadow-md scale-[1.02]'
                    : isShaking
                    ? 'bg-red-500 text-white ring-4 ring-red-300'
                    : card.type === 'word'
                    ? 'bg-blue-600 hover:bg-blue-700 text-white hover:-translate-y-1 hover:shadow-lg'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white hover:-translate-y-1 hover:shadow-lg'
                }`}
              >
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-black tracking-wider bg-black/15 text-white/90 uppercase">
                  {card.type === 'word' ? '어휘' : '뜻 풀이'}
                </div>

                <p className={`font-semibold tracking-tight leading-snug word-break-keep-all ${
                  card.type === 'word' ? 'text-lg sm:text-xl font-bold' : 'text-xs sm:text-sm font-medium'
                }`}>
                  {card.text}
                </p>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {totalWrongAttempts > 0 && (
        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>실수한 매칭: {totalWrongAttempts}회 (틀린 단어들은 오답 노트에 자동으로 수집됩니다)</span>
        </div>
      )}
    </div>
  );
};
