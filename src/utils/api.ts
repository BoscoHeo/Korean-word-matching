// 교사용 API 요청 헬퍼 유틸리티

/**
 * sessionStorage에서 현재 유효한 교사 세션 토큰을 가져옵니다.
 */
export function getTeacherSession(): string | null {
  return sessionStorage.getItem('teacher_session');
}

/**
 * 교사 세션을 초기화합니다.
 */
export function clearTeacherSession(): void {
  sessionStorage.removeItem('teacher_session');
  sessionStorage.removeItem('is_teacher_unlocked');
}

/**
 * 교사 세션 토큰을 Authorization: Bearer <token> 헤더에 추가하여 fetch를 실행합니다.
 * 401 Unauthorized 수신 시 세션을 자동 정리하고 이벤트를 발생시킵니다.
 */
export async function teacherFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = getTeacherSession();
  const headers = new Headers(init?.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const response = await fetch(input, {
    ...init,
    headers
  });

  if (response.status === 401) {
    clearTeacherSession();
    window.dispatchEvent(new CustomEvent('teacher-session-expired'));
  }

  return response;
}
