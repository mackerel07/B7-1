# B7-1 역할 분담 및 개발 로드맵

이 문서는 팀원 공유용 실행 문서입니다. 날짜별 일정 대신, 각 단계의 완료 조건을 확인한 뒤 다음 단계로 진행합니다.

## 1. 확정 기술 스택

| 영역 | 사용 기술 |
|---|---|
| 프런트엔드 | Vite + React + TypeScript |
| 백엔드 | Python 3.12 + FastAPI |
| AI | Google Gemini API + google-genai |
| 인증 | Supabase Auth |
| 데이터베이스 | Supabase PostgreSQL |
| 배포 | Vercel |

Gemini API는 FastAPI 서버에서만 호출합니다. Gemini API 키는 프런트엔드 코드에 포함하지 않습니다.

## 2. 역할 분담

기존 계획의 팀원 B는 아래의 팀원 1, 팀원 C는 팀원 2에 해당합니다.

### 팀장 - 백엔드·인프라·최종 통합

만들어야 할 부분:

- Supabase Auth와 chat_logs 테이블
- 사용자별 데이터 보호를 위한 RLS 정책
- FastAPI 프로젝트와 인증 처리
- POST /api/chat
- GET /api/me/chats
- 최근 대화를 포함한 Gemini 문맥 구성
- Gemini 호출 타임아웃과 오류 응답
- 요청, AI 호출, DB 저장 서버 로그
- Vercel 환경 변수와 Production 배포
- API, DB, 실행·배포 문서

간단 테스트:

- 비로그인 요청이 401로 차단되는지 확인합니다.
- Gemini 응답과 질문이 DB에 저장되는지 확인합니다.
- 사용자끼리 대화 기록이 분리되는지 확인합니다.
- Gemini timeout과 API 실패 시 안내 메시지가 반환되는지 확인합니다.
- 배포 URL에서 로그인부터 기록 조회까지 확인합니다.

### 팀원 1 - 로그인·회원가입·대화 기록

담당 페이지:

- **/login**: 이메일과 비밀번호 로그인
- **/signup**: 회원가입과 입력값 검증
- **/history**: 로그인 사용자의 대화 기록
- **공통 화면**: 헤더, 메뉴, 로그아웃, 보호 페이지 이동

만들어야 할 부분:

- 로그인·회원가입 폼
- 로그인 상태 확인과 보호 페이지 처리
- 로그아웃
- 대화 기록 목록
- 로딩, 빈 목록, 오류 화면
- 모바일 화면 대응

간단 테스트:

- 회원가입, 로그인, 로그아웃이 정상 동작하는지 확인합니다.
- 비로그인 사용자가 /chat과 /history에 접근하지 못하는지 확인합니다.
- 본인의 대화 기록만 표시되는지 확인합니다.

### 팀원 2 - 채팅

담당 페이지:

- **/chat**: 질문 입력과 AI 답변 확인

만들어야 할 부분:

- 사용자와 AI 메시지 화면
- 질문 입력과 전송
- 빈 입력과 최대 길이 제한
- 전송 중 표시와 중복 요청 방지
- FastAPI 호출과 인증 토큰 전달
- timeout, API 오류, 다시 시도 안내
- 대화 ID 유지와 새 메시지 자동 스크롤
- 모바일 화면 대응

간단 테스트:

- 질문과 AI 답변이 같은 화면에 표시되는지 확인합니다.
- 로그인 토큰이 없는 요청이 처리되지 않는지 확인합니다.
- 로딩 중 중복 전송이 차단되는지 확인합니다.
- timeout과 API 실패 안내가 표시되는지 확인합니다.

## 3. 파일 담당 범위

| 담당 | 기본 담당 폴더·파일 |
|---|---|
| 팀장 | app, supabase, scripts, tests/backend, vercel.json, .env.example |
| 팀원 1 | 로그인·회원가입·기록 페이지, auth, layout 컴포넌트 |
| 팀원 2 | 채팅 페이지, chat 컴포넌트, useChat 훅 |

라우터, 전역 스타일, 공통 API 타입처럼 함께 수정할 수 있는 파일은 작업 전에 담당자를 정합니다. API 요청·응답 형태는 팀장이 먼저 공유합니다.

## 4. 개발 로드맵

| 단계 | 진행 내용 | 완료 기준 |
|---|---|---|
| 1. 작업 기준 확정 | 브랜치, 화면 경로, API, DB 필드, 환경 변수 확정 | 팀원 모두 기능 브랜치에서 작업할 수 있습니다. |
| 2. 기본 화면과 서버 구성 | FastAPI health, 프런트 라우팅, 각 페이지 기본 화면 | 모든 경로가 열리고 health API가 응답합니다. |
| 3. 개별 기능 구현 | 인증·기록 페이지, 채팅 페이지, Gemini·DB API 구현 | 각 담당 기능을 독립적으로 확인할 수 있습니다. |
| 4. 전체 기능 연결 | 로그인 → 질문 → Gemini → DB 저장 → 기록 조회 | Preview 환경에서 전체 흐름이 성공합니다. |
| 5. 오류·보안 확인 | 입력 검증, timeout, API 실패, RLS, 비밀정보 확인 | 주요 실패 상황이 안전하게 처리됩니다. |
| 6. 문서·Git 확인 | README, API, DB, 배포, 역할 기록과 커밋 확인 | 팀원별 유의미한 커밋 10개 이상과 PR 기록이 있습니다. |
| 7. Production 배포 | 릴리스 PR, Vercel 배포, 외부 접속 확인 | 공개 URL에서 전체 기능이 정상 동작합니다. |

현재 단계의 완료 기준을 통과하지 못하면 새 기능을 추가하지 않고 해당 문제를 먼저 해결합니다.

## 5. Vercel 관련 결론

- Vercel은 FastAPI를 공식 지원하므로 별도 백엔드 서버가 반드시 필요한 것은 아닙니다.
- 300초는 서비스 전체의 종료 시간이 아니라 요청 한 건의 최대 실행 시간입니다.
- Gemini 호출은 25초에서 자체 종료하고 사용자에게 오류 안내를 반환합니다.
- 서버 메모리와 로컬 SQLite에는 상태를 저장하지 않고 Supabase에 저장합니다.
- 현재 과제 범위에서는 Vercel + FastAPI + Supabase 구성이 가장 단순하고 안전합니다.
- 5분 이상의 작업, 상시 백그라운드 작업 또는 서버 로컬 디스크가 필요해질 때만 다른 백엔드 호스팅을 검토합니다.

평가 전에는 Vercel Production URL, Supabase 활성 상태, Gemini API 키와 할당량을 확인합니다.

## 6. Git·PR 운영 규칙

- main은 평가 가능한 Production 브랜치로 사용합니다.
- develop은 기능 통합과 Preview 브랜치로 사용합니다.
- 기능은 feat/<담당자>-<기능> 브랜치에서 작업합니다.
- 오류 수정은 fix/<담당자>-<기능> 브랜치에서 작업합니다.
- 모든 작업은 Issue와 연결합니다.
- main과 develop에 직접 push하지 않습니다.
- 최소 한 명의 리뷰 후 merge합니다.
- Squash merge를 사용하지 않습니다.
- GitHub의 Create a merge commit을 사용합니다.
- 빈 커밋이나 의미 없이 나눈 커밋은 커밋 수로 인정하지 않습니다.
- 각 팀원은 자신의 GitHub 계정과 연결된 이름과 이메일로 커밋합니다.
- 팀원별 유의미한 non-merge 커밋을 최소 10개 남깁니다.

권장 PR 구성:

| 담당 | PR 1 | PR 2 | PR 3 | 추가 PR |
|---|---|---|---|---|
| 팀장 | 프로젝트·Supabase 기반 | FastAPI 인증·DB | Gemini·문맥·오류 | 로그·테스트·배포·문서 |
| 팀원 1 | 라우팅·공통 화면 | 로그인·회원가입 | 기록 화면·테스트 | 필요 시 접근성 개선 |
| 팀원 2 | 채팅 기본 화면 | API·로딩·오류 | 반응형·테스트 | 필요 시 통합 수정 |

리뷰 기준:

- 팀장 PR은 팀원 1 또는 팀원 2가 리뷰합니다.
- 팀원 1 PR은 팀원 2가 우선 리뷰합니다.
- 팀원 2 PR은 팀원 1이 우선 리뷰합니다.
- develop에서 main으로 보내는 릴리스 PR은 팀원 1과 팀원 2가 모두 승인합니다.

## 7. 공식 참고 문서

- [Vercel FastAPI 공식 문서](https://vercel.com/docs/frameworks/backend/fastapi)
- [Vercel Functions 제한](https://vercel.com/docs/functions/limitations)
- [Supabase 무료 프로젝트 일시 정지](https://supabase.com/docs/guides/platform/free-project-pausing)
- [Google GenAI SDK](https://ai.google.dev/gemini-api/docs/libraries)
- [Gemini 모델 목록](https://ai.google.dev/gemini-api/docs/models)
