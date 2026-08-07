import React, { useState } from 'react';
import { Lock, KeyRound, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { DEFAULT_PASSCODE } from '../constants';

interface TeacherAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const TeacherAuthModal: React.FC<TeacherAuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const [pin, setPin] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim()) {
      setErrorMsg('비밀번호(PIN)를 입력해 주세요.');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pin.trim() })
      });
      const data = await res.json();

      if (data.success) {
        setPin('');
        onSuccess();
      } else {
        // Fallback to local check if server returns failure in client static deployment
        const localPasscode = localStorage.getItem('teacher_passcode') || DEFAULT_PASSCODE;
        if (pin.trim() === localPasscode) {
          setPin('');
          onSuccess();
        } else {
          setErrorMsg(data.message || '비밀번호가 올바르지 않습니다.');
        }
      }
    } catch {
      // Fallback check if server offline or static deployment (Netlify)
      const localPasscode = localStorage.getItem('teacher_passcode') || DEFAULT_PASSCODE;
      if (pin.trim() === localPasscode || pin.trim() === DEFAULT_PASSCODE) {
        setPin('');
        onSuccess();
      } else {
        setErrorMsg('비밀번호가 올바르지 않습니다.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-scale-up">
        {/* Header */}
        <div className="bg-slate-900 p-6 text-white relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600 rounded-2xl shadow-md text-white">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-extrabold text-lg">선생님 전용 인증</h3>
              <p className="text-xs text-slate-300">개별 학생 학습 기록 및 데이터 보호</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition p-1 rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-2xl text-xs text-amber-900 leading-relaxed">
            🔒 <strong>개인정보 및 성적 보호 모드</strong><br />
            학생들의 개별 성적 및 종합 통계는 선생님만 조회할 수 있습니다. 비밀번호를 입력해 주세요.
          </div>

          {errorMsg && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-bold">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
              <KeyRound className="w-4 h-4 text-blue-600" />
              <span>선생님 비밀번호 (PIN)</span>
            </label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder={`비밀번호 입력 (기본: ${DEFAULT_PASSCODE})`}
              className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm font-extrabold tracking-widest outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition text-center"
              autoFocus
            />
            <p className="text-[11px] text-slate-400 mt-1.5 text-center">
              * 초기 설정 비밀번호: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-mono font-bold">{DEFAULT_PASSCODE}</code> (대시보드에서 변경 가능)
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-500/20 transition flex items-center justify-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isLoading ? '확인 중...' : '인증하고 접속'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
