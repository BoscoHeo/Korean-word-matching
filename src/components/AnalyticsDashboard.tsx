import React, { useState, useEffect } from 'react';
import { LearningLog, StudentSummary, ClassAnalytics } from '../types';
import {
  Users,
  Award,
  Clock,
  Target,
  Download,
  Search,
  BookOpen,
  Calendar,
  AlertTriangle,
  RefreshCw,
  BarChart2,
  User,
  CheckCircle2,
  FileSpreadsheet,
  Settings,
  ShieldCheck,
  KeyRound,
  Link as LinkIcon,
  Save
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line
} from 'recharts';

import { DEFAULT_PASSCODE } from '../constants';

interface AnalyticsDashboardProps {
  logs: LearningLog[];
  onRefreshData: () => void;
  selectedStudentFilter?: string;
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  logs,
  onRefreshData,
  selectedStudentFilter = ''
}) => {
  const [activeTab, setActiveTab] = useState<'class' | 'student' | 'export' | 'settings'>('class');
  const [classAnalytics, setClassAnalytics] = useState<ClassAnalytics | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<string>(selectedStudentFilter);
  const [studentSummary, setStudentSummary] = useState<StudentSummary | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Teacher settings state
  const [gasUrlInput, setGasUrlInput] = useState('');
  const [passcodeInput, setPasscodeInput] = useState(DEFAULT_PASSCODE);
  const [settingsSaveMsg, setSettingsSaveMsg] = useState('');

  useEffect(() => {
    // Load from localStorage first as instant fallback
    const cachedSettings = localStorage.getItem('teacher_settings');
    if (cachedSettings) {
      try {
        const parsed = JSON.parse(cachedSettings);
        if (parsed.gasUrl) setGasUrlInput(parsed.gasUrl);
        if (parsed.passcode) setPasscodeInput(parsed.passcode);
      } catch {
        // ignore
      }
    }

    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.settings) {
          if (data.settings.gasUrl) setGasUrlInput(data.settings.gasUrl);
          if (data.settings.passcode) setPasscodeInput(data.settings.passcode);
          localStorage.setItem('teacher_settings', JSON.stringify(data.settings));
          if (data.settings.gasUrl) localStorage.setItem('teacher_gas_url', data.settings.gasUrl);
          if (data.settings.passcode) localStorage.setItem('teacher_passcode', data.settings.passcode);
        }
      })
      .catch((err) => console.log('Notice: Running in static mode or server offline', err));
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsSaveMsg('');
    
    const cleanGasUrl = gasUrlInput.trim();
    const cleanPasscode = passcodeInput.trim() || '1234';

    // Always persist to localStorage for client-side / Netlify compatibility
    localStorage.setItem('teacher_gas_url', cleanGasUrl);
    localStorage.setItem('teacher_passcode', cleanPasscode);
    localStorage.setItem('teacher_settings', JSON.stringify({ gasUrl: cleanGasUrl, passcode: cleanPasscode }));

    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gasUrl: cleanGasUrl, passcode: cleanPasscode })
      });
    } catch {
      // Ignore API server errors when deployed as static SPA
    }

    setSettingsSaveMsg('✅ 선생님 설정(구글 시트 연동 주소 & 비밀번호)이 정상 저장되었습니다.');
    setTimeout(() => setSettingsSaveMsg(''), 5000);
  };

  // Fetch Class Analytics
  useEffect(() => {
    fetch('/api/analytics/class')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setClassAnalytics(data.analytics);
        }
      })
      .catch((err) => console.error(err));
  }, [logs]);

  // Unique student list
  const studentNames = Array.from(new Set(logs.map((l) => l.studentName))).filter(Boolean);

  // Set default student if none selected
  useEffect(() => {
    if (!selectedStudent && studentNames.length > 0) {
      setSelectedStudent(studentNames[0]);
    }
  }, [studentNames]);

  // Fetch Student Specific Analytics
  useEffect(() => {
    if (selectedStudent) {
      fetch(`/api/analytics/student/${encodeURIComponent(selectedStudent)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setStudentSummary(data.summary);
          }
        })
        .catch((err) => console.error(err));
    }
  }, [selectedStudent, logs]);

  // CSV Export Helper
  const exportToCSV = () => {
    if (logs.length === 0) return;
    const headers = ['ID', '학생이름', '학년/반', '학습페이지', '총단어수', '점수', '걸린시간(초)', '정확도(%)', '실수횟수', '학습일시'];
    const rows = logs.map((l) => [
      l.id,
      `"${l.studentName}"`,
      `"${l.gradeClass || ''}"`,
      `"${(l.pages || []).join(', ')}"`,
      l.totalWords,
      l.score,
      l.timeElapsed,
      l.accuracy,
      l.wrongAttemptsCount,
      `"${new Date(l.timestamp).toLocaleString('ko-KR')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `초등_문해력_학습데이터_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleResetData = async () => {
    if (window.confirm('데모 학습 데이터를 초기 상태로 리셋하시겠습니까?')) {
      await fetch('/api/reset-data', { method: 'POST' });
      onRefreshData();
    }
  };

  const filteredLogs = logs.filter((l) => {
    const q = searchQuery.toLowerCase();
    return (
      l.studentName.toLowerCase().includes(q) ||
      (l.gradeClass && l.gradeClass.toLowerCase().includes(q)) ||
      l.pages.some((p) => p.toLowerCase().includes(q))
    );
  });

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 space-y-6">
      {/* Top Banner & Refresh */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            📊 학생 어휘 학습 데이터 분석 시스템
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            학생별 문해력 단어 게임 학습 성취도, 오답 어휘 분석 및 학급 통계 보고서
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRefreshData}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>데이터 새로고침</span>
          </button>

          <button
            onClick={exportToCSV}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel/CSV 다운로드</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-1">
        <button
          onClick={() => setActiveTab('class')}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition flex items-center gap-2 ${
            activeTab === 'class'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <BarChart2 className="w-4 h-4" />
          <span>학급 전체 통계</span>
        </button>

        <button
          onClick={() => setActiveTab('student')}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition flex items-center gap-2 ${
            activeTab === 'student'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <User className="w-4 h-4" />
          <span>학생별 개별 리포트</span>
        </button>

        <button
          onClick={() => setActiveTab('export')}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition flex items-center gap-2 ${
            activeTab === 'export'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>전체 기록 및 내보내기</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition flex items-center gap-2 ${
            activeTab === 'settings'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Settings className="w-4 h-4 text-indigo-200" />
          <span>선생님 환경 설정</span>
        </button>
      </div>

      {/* TAB 1: CLASS OVERVIEW */}
      {activeTab === 'class' && classAnalytics && (
        <div className="space-y-6">
          {/* Key Metrics Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between text-blue-600 mb-2">
                <Users className="w-5 h-5" />
                <span className="text-xs font-bold bg-blue-50 px-2 py-0.5 rounded-full">학생 수</span>
              </div>
              <p className="text-2xl font-black text-slate-900">{classAnalytics.totalStudents}명</p>
              <p className="text-xs text-slate-500 mt-1">참여한 누적 학생 수</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between text-indigo-600 mb-2">
                <Award className="w-5 h-5" />
                <span className="text-xs font-bold bg-indigo-50 px-2 py-0.5 rounded-full">총 게임 수</span>
              </div>
              <p className="text-2xl font-black text-slate-900">{classAnalytics.totalGamesPlayed}회</p>
              <p className="text-xs text-slate-500 mt-1">완료된 게임 횟수</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between text-emerald-600 mb-2">
                <Target className="w-5 h-5" />
                <span className="text-xs font-bold bg-emerald-50 px-2 py-0.5 rounded-full">평균 정확도</span>
              </div>
              <p className="text-2xl font-black text-slate-900">{classAnalytics.classAverageAccuracy}%</p>
              <p className="text-xs text-slate-500 mt-1">학급 전체 매칭 정확도</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between text-purple-600 mb-2">
                <Clock className="w-5 h-5" />
                <span className="text-xs font-bold bg-purple-50 px-2 py-0.5 rounded-full">총 학습 시간</span>
              </div>
              <p className="text-2xl font-black text-slate-900">{classAnalytics.totalStudyMinutes}분</p>
              <p className="text-xs text-slate-500 mt-1">누적 학습 몰입 시간</p>
            </div>
          </div>

          {/* Activity Chart & Top Missed Words */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Chart */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <h3 className="font-bold text-slate-900 text-base mb-4 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600" />
                <span>일별 학급 학습 참여 추이</span>
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={classAnalytics.dailyActivity}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date" tickLine={false} style={{ fontSize: '11px' }} />
                    <YAxis tickLine={false} style={{ fontSize: '11px' }} />
                    <Tooltip />
                    <Bar dataKey="gamesCount" name="게임 플레이 수" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Top Missed Words */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <h3 className="font-bold text-slate-900 text-base mb-1 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span>학급 전체 취약 어휘 Top 5</span>
              </h3>
              <p className="text-xs text-slate-500 mb-4">학생들이 수업 중 가장 많이 헷갈려 한 오답 단어 목록입니다.</p>

              <div className="space-y-3">
                {classAnalytics.topMissedWords.slice(0, 5).map((item, idx) => (
                  <div key={idx} className="p-3 bg-rose-50/50 border border-rose-100 rounded-xl flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-slate-900 text-sm">{item.word}</span>
                        <span className="text-[10px] px-2 py-0.5 bg-slate-200 text-slate-700 font-bold rounded">
                          {item.page}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5 line-clamp-1">{item.def}</p>
                    </div>

                    <span className="shrink-0 text-xs font-bold text-rose-700 bg-rose-100 px-2.5 py-1 rounded-full">
                      총 {item.failCount}회 실수
                    </span>
                  </div>
                ))}

                {classAnalytics.topMissedWords.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-8">아직 오답 기록이 없습니다.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: INDIVIDUAL STUDENT REPORT */}
      {activeTab === 'student' && (
        <div className="space-y-6">
          {/* Select Student Selector */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center gap-4">
            <label className="text-sm font-bold text-slate-800 shrink-0">👤 학생 선택:</label>
            <select
              value={selectedStudent}
              onChange={(e) => setSelectedStudent(e.target.value)}
              className="px-4 py-2 border border-slate-300 rounded-xl font-bold text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
            >
              {studentNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {studentSummary ? (
            <div className="space-y-6">
              {/* Student Summary Dashboard Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <p className="text-xs font-bold text-slate-500">학생 정보</p>
                  <p className="text-xl font-extrabold text-slate-900 mt-1">{studentSummary.studentName}</p>
                  <p className="text-xs text-blue-600 font-semibold mt-0.5">{studentSummary.gradeClass || '반 미지정'}</p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <p className="text-xs font-bold text-slate-500">누적 게임 플레이</p>
                  <p className="text-xl font-extrabold text-slate-900 mt-1">{studentSummary.totalGames}회</p>
                  <p className="text-xs text-slate-500 mt-0.5">총 {Math.round(studentSummary.totalStudySeconds / 60)}분 학습</p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <p className="text-xs font-bold text-slate-500">평균 정확도</p>
                  <p className="text-xl font-extrabold text-emerald-600 mt-1">{studentSummary.averageAccuracy}%</p>
                  <p className="text-xs text-slate-500 mt-0.5">평균 점수: {studentSummary.averageScore}점</p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <p className="text-xs font-bold text-slate-500">집중 복습 필요 어휘</p>
                  <p className="text-xl font-extrabold text-rose-600 mt-1">{studentSummary.frequentlyMissedWords.length}개</p>
                  <p className="text-xs text-slate-500 mt-0.5">오답 노트 수집 단어</p>
                </div>
              </div>

              {/* Student Accuracy Trend Chart & Student Wrong Words */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                  <h3 className="font-bold text-slate-900 text-base mb-4">
                    📈 {studentSummary.studentName} 학생의 정확도 변화 추이
                  </h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={studentSummary.history.slice().reverse()}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis
                          dataKey="timestamp"
                          tickFormatter={(t) => new Date(t).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
                          style={{ fontSize: '11px' }}
                        />
                        <YAxis domain={[0, 100]} style={{ fontSize: '11px' }} />
                        <Tooltip />
                        <Line type="monotone" dataKey="accuracy" name="정확도(%)" stroke="#10b981" strokeWidth={3} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Individual Wrong Word Note */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                  <h3 className="font-bold text-slate-900 text-base mb-1 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    <span>개인 오답 노트 ({studentSummary.frequentlyMissedWords.length}개 어휘)</span>
                  </h3>
                  <p className="text-xs text-slate-500 mb-4">자주 틀린 어휘 뜻 재확인</p>

                  <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                    {studentSummary.frequentlyMissedWords.map((item, idx) => (
                      <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900 text-sm">{item.word}</span>
                          <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full">
                            {item.failCount}회 미스
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1">{item.def}</p>
                      </div>
                    ))}

                    {studentSummary.frequentlyMissedWords.length === 0 && (
                      <p className="text-xs text-emerald-600 font-bold text-center py-10">
                        🎉 틀린 어휘가 없습니다!
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Student History Log Table */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <h3 className="font-bold text-slate-900 text-base mb-4">
                  📜 학습 진행 이력 상세 ({studentSummary.history.length}회)
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold">
                        <th className="p-3">일시</th>
                        <th className="p-3">학습 단원</th>
                        <th className="p-3">점수</th>
                        <th className="p-3">시간</th>
                        <th className="p-3">정확도</th>
                        <th className="p-3">실수 단어</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {studentSummary.history.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50">
                          <td className="p-3 font-medium text-slate-500">
                            {new Date(log.timestamp).toLocaleString('ko-KR')}
                          </td>
                          <td className="p-3 font-bold text-slate-900">{(log.pages || []).join(', ')}</td>
                          <td className="p-3 font-bold text-blue-600">{log.score}점</td>
                          <td className="p-3 text-slate-700">{log.timeElapsed}초</td>
                          <td className="p-3">
                            <span className="px-2 py-1 bg-emerald-100 text-emerald-800 font-bold rounded">
                              {log.accuracy}%
                            </span>
                          </td>
                          <td className="p-3 text-slate-600">
                            {(log.wrongWords || []).map((w) => w.word).join(', ') || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-center py-12 text-slate-500">학생을 선택해 주세요.</p>
          )}
        </div>
      )}

      {/* TAB 3: FULL LOGS TABLE & EXPORT */}
      {activeTab === 'export' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="학생 이름, 학번 또는 페이지 검색..."
                className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleResetData}
                className="px-3.5 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl transition"
              >
                데모 데이터 리셋
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold">
                  <th className="p-3">학생 이름</th>
                  <th className="p-3">학년/반/번호</th>
                  <th className="p-3">학습 페이지</th>
                  <th className="p-3">점수</th>
                  <th className="p-3">소요시간</th>
                  <th className="p-3">정확도</th>
                  <th className="p-3">일시</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="p-3 font-bold text-slate-900">{log.studentName}</td>
                    <td className="p-3 text-slate-600">{log.gradeClass || '-'}</td>
                    <td className="p-3 text-blue-700 font-semibold">{(log.pages || []).join(', ')}</td>
                    <td className="p-3 font-bold text-slate-900">{log.score}점</td>
                    <td className="p-3 text-slate-600">{log.timeElapsed}초</td>
                    <td className="p-3 font-bold text-emerald-600">{log.accuracy}%</td>
                    <td className="p-3 text-xs text-slate-400">
                      {new Date(log.timestamp).toLocaleString('ko-KR')}
                    </td>
                  </tr>
                ))}

                {filteredLogs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      검색 조건에 해당되는 학습 기록이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: TEACHER SETTINGS */}
      {activeTab === 'settings' && (
        <form onSubmit={handleSaveSettings} className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6 shadow-sm">
          <div className="border-b border-slate-200 pb-4">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
              <span>선생님 전용 시스템 및 데이터 연동 설정</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              학생들이 구글 웹앱 주소를 입력하지 않고도 성적이 자동 수집되는 설정 및 보안 비밀번호 관리
            </p>
          </div>

          {settingsSaveMsg && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs sm:text-sm font-bold animate-fade-in">
              {settingsSaveMsg}
            </div>
          )}

          {/* Google Sheets URL Setting */}
          <div className="space-y-2">
            <label className="block text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <LinkIcon className="w-4 h-4 text-blue-600" />
              <span>구글 웹앱 URL (자동 백그라운드 구글 시트 연동)</span>
            </label>
            <input
              type="text"
              value={gasUrlInput}
              onChange={(e) => setGasUrlInput(e.target.value)}
              placeholder="https://script.google.com/macros/s/.../exec"
              className="w-full px-4 py-3 border border-slate-300 rounded-xl text-xs sm:text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 text-slate-900"
            />
            <div className="bg-blue-50/70 border border-blue-100 p-3.5 rounded-xl text-xs text-blue-900 leading-relaxed space-y-1">
              <p className="font-extrabold text-blue-950">💡 구글 시트 연동 핵심 이점:</p>
              <p>• 여기에 선생님의 구글 웹앱 URL을 1번만 등록하면, 학생은 웹앱 주소를 모르거나 치지 않아도 <strong>게임 완료 즉시 선생님 구글 시트로 백그라운드 자동 전송</strong>됩니다.</p>
              <p>• 웹앱 URL이 설정되어 있지 않더라도, 모든 성적은 앱 내 데이터베이스에 안전하게 자동 저장되므로 언제든 Excel/CSV로 다운로드하실 수 있습니다.</p>
            </div>
          </div>

          {/* Teacher Password PIN Setting */}
          <div className="space-y-2 pt-2">
            <label className="block text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <KeyRound className="w-4 h-4 text-indigo-600" />
              <span>선생님 접속 비밀번호 (PIN)</span>
            </label>
            <input
              type="password"
              value={passcodeInput}
              onChange={(e) => setPasscodeInput(e.target.value)}
              placeholder={`기본 비밀번호: ${DEFAULT_PASSCODE}`}
              className="w-48 px-4 py-2.5 border border-slate-300 rounded-xl text-sm font-bold tracking-widest outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 text-slate-900"
            />
            <p className="text-xs text-slate-500">
              * 아이들이 다른 학생들의 개별 데이터 및 단어장 편집에 접근하지 못하도록 보호하는 비밀번호입니다. (기본값: <code className="bg-slate-100 px-1 py-0.5 rounded font-mono font-bold">{DEFAULT_PASSCODE}</code>)
            </p>
          </div>

          <div className="pt-4 border-t border-slate-200 flex justify-end">
            <button
              type="submit"
              className="py-3 px-6 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-sm rounded-xl shadow-md transition flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>선생님 환경 설정 저장하기</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
