import React, { useState } from 'react';
import { Play, CheckSquare, Square, User, Link as LinkIcon, AlertCircle, BookOpen, RotateCcw } from 'lucide-react';

interface GameSetupProps {
  availablePages: Record<string, { word: string; def: string }[]>;
  onStartGame: (
    studentName: string,
    gradeClass: string,
    selectedPages: string[],
    gasUrl: string,
    mode: 'standard' | 'review'
  ) => void;
  initialStudentName?: string;
  initialGradeClass?: string;
  hasWrongWordsForReview?: boolean;
}

export const GameSetup: React.FC<GameSetupProps> = ({
  availablePages,
  onStartGame,
  initialStudentName = '',
  initialGradeClass = '',
  hasWrongWordsForReview = false
}) => {
  const [studentName, setStudentName] = useState(initialStudentName);
  const [gradeClass, setGradeClass] = useState(initialGradeClass);
  const [selectedPages, setSelectedPages] = useState<string[]>(
    Object.keys(availablePages).length > 0 ? [Object.keys(availablePages)[0]] : []
  );
  const [gasUrl, setGasUrl] = useState('');
  const [gameMode, setGameMode] = useState<'standard' | 'review'>('standard');
  const [errorMsg, setErrorMsg] = useState('');

  const pageNames = Object.keys(availablePages);

  const togglePage = (pageName: string) => {
    if (selectedPages.includes(pageName)) {
      setSelectedPages(selectedPages.filter((p) => p !== pageName));
    } else {
      setSelectedPages([...selectedPages, pageName]);
    }
  };

  const toggleAllPages = () => {
    if (selectedPages.length === pageNames.length) {
      setSelectedPages([]);
    } else {
      setSelectedPages([...pageNames]);
    }
  };

  const calculateTotalWords = () => {
    return selectedPages.reduce((acc, p) => acc + (availablePages[p]?.length || 0), 0);
  };

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentName.trim()) {
      setErrorMsg('학생 이름을 입력해 주세요!');
      return;
    }
    if (!gradeClass.trim()) {
      setErrorMsg('학년/반/번호를 입력해 주세요!');
      return;
    }
    if (gameMode === 'standard' && selectedPages.length === 0) {
      setErrorMsg('최소 1개 이상의 학습 페이지를 선택해 주세요!');
      return;
    }
    setErrorMsg('');
    onStartGame(studentName.trim(), gradeClass.trim(), selectedPages, gasUrl.trim(), gameMode);
  };

  return (
    <div className="max-w-3xl mx-auto py-6 px-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
        {/* Card Banner */}
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 p-6 sm:p-8 text-white">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/20 backdrop-blur-md mb-3">
            📖 초등 5~6학년 문해력 필수 어휘
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            어휘 카드 짝맞추기 게임
          </h2>
          <p className="text-blue-100 text-sm mt-1">
            이름과 학습 단원을 선택하여 단어와 그 뜻을 쉽고 재미있게 연결해보세요.
          </p>
        </div>

        <form onSubmit={handleStart} className="p-6 sm:p-8 space-y-6">
          {errorMsg && (
            <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm font-semibold animate-shake">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Student Info Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                <User className="w-4 h-4 text-blue-600" />
                <span>학생 이름 <span className="text-red-500">*</span></span>
              </label>
              <input
                type="text"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="예: 홍길동"
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-slate-900 font-semibold"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-800 mb-2">
                <span>학년/반/번호 <span className="text-red-500">*</span></span>
              </label>
              <input
                type="text"
                value={gradeClass}
                onChange={(e) => setGradeClass(e.target.value)}
                placeholder="예: 6학년 1반 15번"
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-slate-900 font-medium"
                required
              />
            </div>
          </div>

          {/* Game Mode Selection */}
          <div>
            <label className="block text-sm font-bold text-slate-800 mb-3">
              🎮 게임 모드 선택
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setGameMode('standard')}
                className={`p-4 rounded-xl border text-left flex items-start gap-3 transition-all ${
                  gameMode === 'standard'
                    ? 'border-blue-600 bg-blue-50/70 ring-2 ring-blue-500/20'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                }`}
              >
                <div className={`p-2 rounded-lg ${gameMode === 'standard' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">일반 단원 학습 게임</h4>
                  <p className="text-xs text-slate-500 mt-0.5">선택한 페이지의 전체 어휘를 정순/무작위로 학습합니다.</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setGameMode('review')}
                disabled={!hasWrongWordsForReview}
                className={`p-4 rounded-xl border text-left flex items-start gap-3 transition-all ${
                  gameMode === 'review'
                    ? 'border-amber-600 bg-amber-50/70 ring-2 ring-amber-500/20'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                } ${!hasWrongWordsForReview ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <div className={`p-2 rounded-lg ${gameMode === 'review' ? 'bg-amber-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1">
                    <span>오답 노트 집중 재학습</span>
                    {!hasWrongWordsForReview && <span className="text-[10px] text-slate-400 font-normal">(기록 없음)</span>}
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">이전에 틀렸던 단어들만 모아 집중적으로 복습합니다.</p>
                </div>
              </button>
            </div>
          </div>

          {/* Page Checkbox Selection (Only in Standard Mode) */}
          {gameMode === 'standard' && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-800 text-sm">📖 학습 페이지 선택</span>
                  <span className="text-xs px-2.5 py-0.5 bg-blue-100 text-blue-800 rounded-full font-bold">
                    총 {calculateTotalWords()}개 단어
                  </span>
                </div>
                <button
                  type="button"
                  onClick={toggleAllPages}
                  className="text-xs font-bold text-blue-600 hover:text-blue-800 underline transition"
                >
                  {selectedPages.length === pageNames.length ? '전체 해제' : '전체 선택'}
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
                {pageNames.map((pageName) => {
                  const isChecked = selectedPages.includes(pageName);
                  const wordCount = availablePages[pageName]?.length || 0;
                  return (
                    <button
                      key={pageName}
                      type="button"
                      onClick={() => togglePage(pageName)}
                      className={`flex items-center justify-between p-3 rounded-xl border text-xs font-bold transition-all text-left ${
                        isChecked
                          ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        {isChecked ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 text-slate-400" />}
                        <span>{pageName}</span>
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${isChecked ? 'bg-blue-700 text-blue-100' : 'bg-slate-100 text-slate-500'}`}>
                        {wordCount}개
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Automatic Storage & Student Privacy Info Box */}
          <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
            <div className="p-2 bg-blue-600 text-white rounded-lg shrink-0 mt-0.5">
              <CheckSquare className="w-4 h-4" />
            </div>
            <div className="text-xs text-blue-900 leading-relaxed">
              <span className="font-extrabold block text-sm text-blue-950 mb-0.5">
                ⚡ 학습 기록 자동 저장 & 개인정보 보호 시스템
              </span>
              학생은 웹앱 주소를 따로 입력하지 않아도 게임 완료 시 성적이 서버(및 선생님 구글 시트)에 자동 저장됩니다.<br />
              <span className="text-blue-700 font-semibold">* 다른 학생의 개별 데이터는 볼 수 없으며, 오직 선생님만 조회할 수 있습니다.</span>
            </div>
          </div>

          {/* Start Button */}
          <button
            type="submit"
            className="w-full py-4 px-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold text-base sm:text-lg rounded-xl shadow-lg shadow-blue-500/25 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
          >
            <Play className="w-5 h-5 fill-current" />
            <span>
              {gameMode === 'standard'
                ? `선택한 페이지 (${calculateTotalWords()}단어) 학습 시작하기`
                : '오답 노트 어휘 집중 복습 시작하기'}
            </span>
          </button>
        </form>
      </div>
    </div>
  );
};
