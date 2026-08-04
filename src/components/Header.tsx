import React from 'react';
import { BookOpen, BarChart3, Settings, Volume2, VolumeX, Sparkles, User, RefreshCw, Lock, Unlock } from 'lucide-react';

interface HeaderProps {
  activeTab: 'game' | 'analytics' | 'words' | 'settings';
  setActiveTab: (tab: 'game' | 'analytics' | 'words' | 'settings') => void;
  studentName: string;
  gradeClass: string;
  soundEnabled: boolean;
  toggleSound: () => void;
  onChangeStudent: () => void;
  isTeacherUnlocked: boolean;
  onLockTeacher: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  studentName,
  gradeClass,
  soundEnabled,
  toggleSound,
  onChangeStudent,
  isTeacherUnlocked,
  onLockTeacher
}) => {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-2">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-tr from-blue-600 to-indigo-600 text-white p-2.5 rounded-xl shadow-md shadow-blue-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
                🧠 초등 문해력 어휘 게임
              </h1>
              <p className="text-xs text-slate-500 hidden sm:block">
                어휘력 쑥쑥 카드 맞추기 & 자동 데이터 저장 분석
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('game')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                activeTab === 'game'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BookOpen className="w-4 h-4 text-blue-600" />
              <span>게임</span>
            </button>

            <button
              onClick={() => setActiveTab('analytics')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                activeTab === 'analytics'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart3 className="w-4 h-4 text-emerald-600" />
              <span>학습 데이터</span>
              {!isTeacherUnlocked && <Lock className="w-3 h-3 text-slate-400 ml-0.5" />}
            </button>

            <button
              onClick={() => setActiveTab('words')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                activeTab === 'words'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Settings className="w-4 h-4 text-indigo-600" />
              <span className="hidden sm:inline">단어장</span>
              {!isTeacherUnlocked && <Lock className="w-3 h-3 text-slate-400 ml-0.5" />}
            </button>
          </nav>

          {/* User Info & Controls */}
          <div className="flex items-center gap-2">
            {isTeacherUnlocked ? (
              <div className="flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-900 px-2.5 py-1 rounded-xl text-xs font-bold">
                <Unlock className="w-3.5 h-3.5 text-amber-600" />
                <span className="hidden sm:inline">선생님 인증됨</span>
                <button
                  onClick={onLockTeacher}
                  className="ml-1 text-[10px] px-1.5 py-0.5 bg-amber-200 hover:bg-amber-300 text-amber-900 rounded transition"
                  title="선생님 모드 종료 (잠금)"
                >
                  잠그기
                </button>
              </div>
            ) : null}

            {studentName && (
              <div className="hidden sm:flex items-center gap-2 bg-blue-50 border border-blue-100 text-blue-900 px-3 py-1.5 rounded-xl text-xs font-semibold">
                <User className="w-3.5 h-3.5 text-blue-600" />
                <div className="flex flex-col leading-none">
                  <span className="font-bold">{studentName}</span>
                  {gradeClass && <span className="text-[10px] text-blue-600/80">{gradeClass}</span>}
                </div>
                <button
                  onClick={onChangeStudent}
                  title="학생 변경"
                  className="ml-1 text-blue-500 hover:text-blue-700 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>
            )}

            <button
              onClick={toggleSound}
              title={soundEnabled ? "음성/효과음 켜짐" : "음성/효과음 꺼짐"}
              className={`p-2 rounded-xl transition-colors border ${
                soundEnabled
                  ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  : 'bg-slate-100 border-slate-200 text-slate-400'
              }`}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4 text-blue-600" /> : <VolumeX className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
