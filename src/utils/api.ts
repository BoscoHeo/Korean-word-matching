// 교사용 API 요청 헬퍼 유틸리티 (SEC-2 대비)

/**
 * sessionStorage에서 현재 유효한 교사 세션 토큰을 가져옵니다.
 */
export function getTeacherSession(): string | null {
  return sessionStorage.getItem('teacher_session');
}

/**
 * 교사 세션 토큰이 있으면 Authorization: Bearer <token> 헤더를 추가하여 fetch를 실행합니다.
 */
export async function teacherFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = getTeacherSession();
  const headers = new Headers(init?.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(input, {
    ...init,
    headers
  });
}
