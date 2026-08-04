import React from 'react';
import { WrongWordRecord } from '../types';
import { Award, Clock, Target, RotateCcw, BookOpen, BarChart2, CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react';

interface GameResultsProps {
  studentName: string;
  gradeClass: string;
  selectedPages: string[];
  score: number;
  timeElapsed: number;
  completedWords: number;
  totalWords: number;
  wrongWords: WrongWordRecord[];
  wrongAttemptsCount: number;
  onRestartSamePages: () => void;
  onChooseNewPages: () => void;
  onViewAnalytics: () => void;
  syncStatusMessage?: string;
}

export const GameResults: React.FC<GameResultsProps> = ({
  studentName,
  gradeClass,
  selectedPages,
  score,
  timeElapsed,
  completedWords,
  totalWords,
  wrongWords,
  wrongAttemptsCount,
  onRestartSamePages,
  onChooseNewPages,
  onViewAnalytics,
  syncStatusMessage
}) => {
  const isPartial = completedWords < totalWords;
  const baseWords = completedWords > 0 ? completedWords : totalWords;
  const accuracy = baseWords > 0
    ? Math.max(0, Math.round(((baseWords - wrongWords.length) / baseWords) * 100))
    : 0;

  const getEvaluationGrade = () => {
    if (isPartial) return { title: `⏸️ 학습 중단 기록 (${completedWords}/${totalWords}개 완료)`, color: 'text-amber-600 bg-amber-50 border-amber-200' };
    if (accuracy >= 100) return { title: '🌟 완벽한 어휘 마스터!', color: 'text-amber-600 bg-amber-50 border-amber-200' };
    if (accuracy >= 80) return { title: '🎖️ 우수한 문해력 실력자!', color: 'text-blue-600 bg-blue-50 border-blue-200' };
    return { title: '💪 차근차근 어휘 탐험가!', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' };
  };

  const evalGrade = getEvaluationGrade();

  return (
    <div className="max-w-3xl mx-auto py-6 px-4">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden">
        {/* Celebration / Summary Header */}
        <div className={`p-8 sm:p-10 text-white text-center relative overflow-hidden ${
          isPartial
            ? 'bg-gradient-to-br from-slate-700 via-slate-800 to-indigo-900'
            : 'bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700'
        }`}>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/20 backdrop-blur-md text-xs sm:text-sm font-bold mb-3">
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>{selectedPages.join(', ')} {isPartial ? '중단 기록' : '완료'}</span>
          </div>

          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-2">
            {isPartial ? `👍 수고했어요, ${studentName} 학생!` : `🎉 참 잘했어요, ${studentName} 학생!`}
          </h2>
          <p className="text-blue-100 text-sm sm:text-base">
            {isPartial
              ? `중간에 학습을 중단하였지만, 진행한 ${completedWords}개 어휘(${totalWords}개 중) 데이터가 안전하게 저장되었습니다.`
              : '모든 단어 카드의 짝을 완벽하게 맞췄습니다. 학습 데이터가 자동으로 기록되었습니다.'}
          </p>

          <div className="mt-6 inline-block px-5 py-2 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20">
            <span className="text-base font-extrabold text-amber-300">
              {evalGrade.title}
            </span>
          </div>
        </div>

        {/* Sync Status Banner */}
        {syncStatusMessage && (
          <div className="bg-emerald-50 border-b border-emerald-200 p-3.5 px-6 text-emerald-800 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{syncStatusMessage}</span>
          </div>
        )}

        {/* Results Metrics Grid */}
        <div className="p-6 sm:p-8 space-y-8">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center">
              <div className="flex justify-center mb-1 text-amber-500">
                <Award className="w-6 h-6" />
              </div>
              <p className="text-xs font-bold text-slate-500">최종 점수</p>
              <p className="text-xl sm:text-2xl font-black text-slate-900 mt-1">{score}점</p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center">
              <div className="flex justify-center mb-1 text-blue-500">
                <Clock className="w-6 h-6" />
              </div>
              <p className="text-xs font-bold text-slate-500">걸린 시간</p>
              <p className="text-xl sm:text-2xl font-black text-slate-900 mt-1">{timeElapsed}초</p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center">
              <div className="flex justify-center mb-1 text-emerald-500">
                <Target className="w-6 h-6" />
              </div>
              <p className="text-xs font-bold text-slate-500">정확도</p>
              <p className="text-xl sm:text-2xl font-black text-slate-900 mt-1">{accuracy}%</p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center">
              <div className="flex justify-center mb-1 text-purple-500">
                <BookOpen className="w-6 h-6" />
              </div>
              <p className="text-xs font-bold text-slate-500">학습 단어 수</p>
              <p className="text-xl sm:text-2xl font-black text-slate-900 mt-1">{completedWords}개</p>
            </div>
          </div>

          {/* Wrong Answer Review Note */}
          {wrongWords.length > 0 ? (
            <div className="bg-rose-50/70 border border-rose-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3 text-rose-900">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                <h3 className="font-bold text-base">✏️ 이번 게임 오답 노트 ({wrongWords.length}개 어휘)</h3>
              </div>
              <p className="text-xs text-rose-700 mb-4">
                헷갈렸던 단어를 다시 확인하고 뜻을 복습해보세요.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {wrongWords.map((item, idx) => (
                  <div key={idx} className="bg-white border border-rose-200 p-3 rounded-xl shadow-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-slate-900 text-sm">{item.word}</span>
                      <span className="text-[10px] px-2 py-0.5 bg-rose-100 text-rose-700 font-bold rounded-full">
                        {item.wrongMatchesCount}회 실수
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">{item.def}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-center text-emerald-800">
              <span className="text-2xl">✨</span>
              <h4 className="font-bold text-base mt-1">단 한 번의 실수도 없이 완벽하게 맞췄습니다!</h4>
              <p className="text-xs text-emerald-700 mt-0.5">정말 뛰어난 어휘 실력입니다.</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <button
              onClick={onRestartSamePages}
              className="py-3.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-sm transition flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              <span>같은 단원 재도전</span>
            </button>

            <button
              onClick={onChooseNewPages}
              className="py-3.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm transition flex items-center justify-center gap-2"
            >
              <BookOpen className="w-4 h-4" />
              <span>다른 단원 선택</span>
            </button>

            <button
              onClick={onViewAnalytics}
              className="py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm transition flex items-center justify-center gap-2"
            >
              <BarChart2 className="w-4 h-4" />
              <span>학습 분석 리포트</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
