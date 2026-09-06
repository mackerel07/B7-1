# B7-1 웹 기반 AI 챗봇 프로젝트 실행 계획

작성 기준일: 2026-09-04  
원문 요구사항: `B7-1.pdf` 7쪽 전체

## 0. 결론

이 프로젝트의 권장 스택은 다음과 같다.

| 영역 | 선택 | 선택 이유 |
|---|---|---|
| 배포 | Vercel | 평가 시 외부 접속 URL, Git 기반 Preview/Production 배포 제공 |
| 백엔드 | Python 3.12 + FastAPI | 과제의 명시적 필수 기술이며 Vercel Python Runtime에서 공식 지원 |
| 프런트엔드 | Vite + React + TypeScript | 로그인/채팅/히스토리 상태를 짧은 일정 안에 명확히 구현하고 정적 빌드 가능 |
| 인증 | Supabase Auth (email/password) | 회원가입, 로그인, 세션/JWT를 직접 구현하지 않고 요구사항 충족 |
| 데이터베이스 | Supabase Postgres | Vercel의 비영속 파일시스템과 호환되며 사용자별 로그 조회, RLS, 원격 검증에 적합 |
| DB 접근 | Supabase Data API(PostgREST) + 사용자 JWT + RLS | 서버리스 TCP 연결 문제를 줄이고 DB에서도 사용자별 격리 강제 |
| AI 연동 | Google Gemini API + `google-genai` | 공식 Python SDK를 서버에서 호출하고 키/모델/타임아웃을 환경 변수화 |
| HTTP | `httpx.AsyncClient` | Supabase Auth/Data API와 AI API를 비동기로 호출하고 명시적 timeout 적용 |
| 설정 | `pydantic-settings` + `.env`/Vercel env | 누락된 설정을 시작 시 검증하고 민감정보를 코드에서 분리 |
| 테스트 | `pytest`, `pytest-asyncio`, `respx` + 프런트 테스트 + 배포 smoke test | 성공, 인증, 타임아웃, DB 실패를 재현 가능하게 검증 |
| 패키지 | `uv`/`pyproject.toml`/`uv.lock`, npm lockfile | Python/JS 의존성을 정확히 고정 |

핵심 결정은 **FastAPI는 유지하고 SQLite만 Supabase Postgres로 바꾸는 것**이다.

## 1. 요구사항 해석과 기술 결정

### 1.1 필수와 권장의 구분

- `Python & FastAPI로 구현한다`는 필수다.
- `SQLite 사용을 권장`은 권장이지 필수가 아니다.
- 따라서 Supabase Postgres 사용은 문서 위반이 아니다.
- 단, 데이터베이스가 평가자에게 확인 가능해야 하므로 사용자용 로그 API와 확인용 SQL을 함께 제공한다.
- 6~7쪽의 UI 문구, `AI_TIMEOUT`, `GET /api/me/chats`, `scripts/check_logs.sql`은 참고 예시다. 동일한 형태가 필수는 아니지만, 평가 편의를 위해 경로와 오류 코드는 가능한 한 예시와 맞춘다.
- 1쪽의 120시간은 학습시간 메타데이터이며 구현 완료 조건은 아니다.

### 1.2 SQLite를 사용하지 않는 이유

SQLite 자체가 나쁜 선택은 아니지만, Vercel Function의 로컬 파일시스템은 영속 저장소가 아니다. 인스턴스가 교체되거나 동시에 여러 인스턴스가 뜨면 로컬 `.db` 파일을 공유할 수 없으므로 운영 데이터가 유실되거나 갈라질 수 있다.

따라서 다음 조합은 피한다.

- Vercel Function + 로컬 SQLite 파일
- `/tmp`에 SQLite를 두고 영속 DB처럼 사용
- 개발은 SQLite, 운영은 Postgres로 나눠 두 종류의 동작을 유지

Supabase를 선택할 때 생기는 평가상의 단점은 저장소에서 `.db` 파일을 바로 열 수 없다는 점뿐이다. 이를 다음 증빙으로 보완한다.

1. 로그인 사용자가 자신의 로그를 조회하는 `GET /api/me/chats`
2. `scripts/check_logs.sql`
3. `supabase/migrations/*.sql`
4. README의 ERD, 필드 설명, 예시 응답
5. 필요 시 민감정보를 가린 Supabase Table Editor 캡처

### 1.3 Vercel에서 FastAPI 사용 가능 여부

Vercel은 현재 FastAPI ASGI 애플리케이션을 공식 지원한다. 지원 entrypoint에서 이름이 `app`인 FastAPI 인스턴스를 찾아 전체 앱을 하나의 Vercel Function으로 배포한다.

다만 이는 항상 떠 있는 Uvicorn 서버와 같지 않다.

- 프로세스 메모리에 사용자 세션, 대화 문맥, 작업 큐를 영속 보관하지 않는다.
- 모든 문맥과 상태는 Supabase에 저장한다.
- AI 호출 timeout은 25초, Vercel `maxDuration`은 60초를 초기값으로 둔다.
- 장시간 background task, 로컬 파일 영속화, 프로세스 고정 스케줄러를 사용하지 않는다.
- Python 함수는 하나의 bundle이므로 무거운 ML 모델을 포함하지 않고 외부 AI API를 호출한다.
- Function과 Supabase 프로젝트는 가능한 한 같은 지역에 배치한다.

현재 공식 한도 중 이 프로젝트에 직접 관련된 값은 Python bundle 500MB, 일반 요청/응답 body 4.5MB, Fluid Compute Hobby 최대 실행시간 300초다. 우리 앱의 자체 제한을 이보다 훨씬 낮게 두어 플랫폼 timeout 전에 통제된 오류를 반환한다.

## 2. 목표 아키텍처

```text
Browser
  ├─ Vite/React 정적 UI
  ├─ Supabase Auth 회원가입·로그인
  └─ access token을 Authorization: Bearer 로 전달
                    │
                    ▼
Vercel - FastAPI single Function
  ├─ 요청 ID 발급 및 request_received 로그
  ├─ Supabase Auth에서 JWT 서버 검증
  ├─ Pydantic 입력 검증
  ├─ 최근 N개 성공 대화 조회
  ├─ AI API 호출(명시적 timeout)
  ├─ 질문·응답 DB 저장
  └─ 사용자 응답 또는 통제된 오류 반환
                    │
                    ▼
Supabase
  ├─ Auth
  ├─ Postgres chat_logs
  ├─ Data API explicit GRANT
  └─ user_id 기반 RLS
```

권장 저장소 구조:

```text
B7-1/
├─ app/
│  ├─ main.py                 # Vercel이 찾는 FastAPI app
│  ├─ api/                    # chat/history/health routes
│  ├─ core/                   # settings, errors, logging
│  ├─ services/               # auth, AI, context orchestration
│  └─ repositories/           # Supabase Data API 접근
├─ frontend/
│  ├─ src/
│  └─ dist/                   # build 결과, Git에서는 제외
├─ supabase/
│  ├─ config.toml
│  └─ migrations/
├─ scripts/check_logs.sql
├─ tests/
├─ docs/
├─ .env.example
├─ pyproject.toml
├─ uv.lock
├─ vercel.json
└─ README.md
```

Vite 결과물은 FastAPI의 정적 frontend 지원으로 같은 Vercel 프로젝트에서 제공한다. 따라서 평가자에게는 하나의 웹 URL만 제공하고 별도 frontend/backend 도메인과 CORS 설정을 만들지 않는다.

### 2.1 정상 요청 흐름

1. 사용자가 이메일/비밀번호로 가입 또는 로그인한다.
2. 브라우저는 Supabase access token을 얻는다.
3. 브라우저가 `POST /api/chat`에 질문과 Bearer token을 보낸다.
4. FastAPI가 Supabase Auth로 token을 검증하고 신뢰 가능한 `user_id`를 얻는다.
5. 빈 문자열과 길이 제한을 서버에서 검증한다.
6. 같은 `user_id`와 `conversation_id`의 최근 5개 성공 Q/A를 오래된 순서로 구성한다.
7. AI API를 최대 25초 동안 호출한다.
8. 질문, 답변, 사용자, 시각, 요청 ID, 지연시간을 Supabase에 저장한다.
9. 답변을 반환하고 UI가 같은 화면에 표시한다.

### 2.2 인증과 RLS 원칙

- UI에서 버튼을 숨기는 것만으로 접근을 제어하지 않는다.
- FastAPI가 모든 보호 API에서 JWT를 다시 검증한다.
- `getSession()`의 디코딩된 값만 신뢰하지 않는다. `supabase.auth.get_user(jwt)` 또는 프로젝트 JWKS 검증을 사용한다.
- DB Data API 호출에는 publishable key와 사용자 JWT를 함께 전달해 RLS를 적용한다.
- `service_role`/secret key는 브라우저에 절대 전달하지 않는다. MVP 런타임에서는 가급적 사용하지 않는다.
- `user_metadata`를 권한 판정에 사용하지 않는다.
- 모든 exposed table에 RLS를 켜고 `auth.uid() = user_id`를 강제한다.
- 이메일 확인을 사용할 경우 redirect URL과 SMTP를 실제 배포 주소 기준으로 검증한다. 단기 평가용 MVP에서는 가입 직후 바로 로그인할 수 있도록 email confirmation을 끄고 그 설정을 README에 명시하는 편이 안정적이다.

2026년 신규 Supabase 프로젝트는 새 테이블의 Data API 노출이 기본으로 꺼질 수 있다. 마이그레이션에 `authenticated` 역할의 명시적 `GRANT`와 RLS 정책을 함께 기록한다.

## 3. 데이터 모델

MVP는 평가와 문맥 구성이 쉬운 단일 테이블을 사용한다.

### `chat_logs`

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `user_id` | uuid FK | `auth.users.id`, 사용자 식별 |
| `conversation_id` | uuid | 같은 대화 묶음 식별 |
| `question` | text | 사용자 질문 |
| `answer` | text | AI 응답 |
| `status` | text | `success` 중심, 필요 시 `failed` |
| `error_code` | text nullable | 실패 추적용, 사용자에게는 안전한 코드만 반환 |
| `request_id` | uuid | 서버 로그와 DB 레코드 연결 |
| `ai_model` | text | 사용 모델 추적 |
| `latency_ms` | integer | AI 응답 지연시간 |
| `created_at` | timestamptz | 생성 시각 |

필수 제약과 인덱스:

- `question`/`answer` not null(성공 레코드)
- `status` check constraint
- `(user_id, conversation_id, created_at desc)` index
- `user_id` FK와 삭제 정책 명시
- `SELECT`, `INSERT`만 `authenticated`에 허용
- RLS `SELECT USING ((select auth.uid()) = user_id)`
- RLS `INSERT WITH CHECK ((select auth.uid()) = user_id)`

## 4. API 계약

### 공개/화면

| Method | Path | 용도 | 인증 |
|---|---|---|---|
| GET | `/` | 로그인/채팅 단일 앱 | 없음, 기능은 상태별 구분 |
| GET | `/api/health` | 배포 smoke/상태 확인 | 없음 |
| GET | `/api/public-config` | Supabase URL/publishable key 전달 | 없음 |

`SUPABASE_PUBLISHABLE_KEY`는 클라이언트 사용을 위해 설계된 공개 가능 키지만, 과제 규칙에 맞춰 저장소에 하드코딩하지 않고 환경 변수에서 제공한다.

### 보호 API

| Method | Path | 요청/응답 핵심 | 실패 |
|---|---|---|---|
| POST | `/api/chat` | `{question, conversation_id?}` → `{answer, chat_id, created_at}` | 401, 422, 502, 503, 504 |
| GET | `/api/me/chats` | 본인의 질문/응답/시각 목록 | 401, 503 |

입력 규칙:

- trim 후 빈 문자열 금지
- 질문 1~2,000자
- `conversation_id`는 UUID
- 로그 조회 limit 기본 20, 최대 100

오류 응답 공통 형태:

```json
{
  "error": {
    "code": "AI_TIMEOUT",
    "message": "현재 응답이 지연되고 있어요. 잠시 후 다시 시도해 주세요.",
    "request_id": "..."
  }
}
```

## 5. 필수 운영 로그

구조화 JSON 로그에 다음 이벤트를 남긴다.

| 이벤트 | 필수 필드 |
|---|---|
| `request_received` | request_id, user_id(검증 후), path |
| `ai_call_start` | request_id, user_id, model |
| `ai_call_success` | request_id, latency_ms |
| `ai_call_failure` | request_id, error_code, latency_ms |
| `db_save_success` | request_id, chat_id |
| `db_save_failure` | request_id, error_code |

질문 전문, 답변 전문, Authorization header, access/refresh token, API key, 비밀번호는 로그에 남기지 않는다.

## 6. 요구사항 추적표

| ID | 원문 요구 | 구현 | 검증/증빙 | 주 담당 |
|---|---|---|---|---|
| R1 | 로그인 사용자의 웹 질문 입력 | React 질문 폼, 보호 상태 | E2E 화면 | B |
| R2 | 서버의 AI API 호출 | FastAPI AI adapter | mock 단위 테스트 + 실제 smoke | A |
| R3 | 같은 흐름에서 응답 표시 | chat message list | 브라우저 E2E | C |
| R4 | 외부 접속 URL | Vercel Production | 외부/시크릿 창 smoke | A |
| R5 | 회원가입/로그인 | Supabase Auth | 가입/로그인/로그아웃 E2E | B |
| R6 | 인증별 접근 구분 | UI guard + FastAPI JWT 검증 | 비로그인 API 401 | B/C |
| R7 | 서버에서 AI key 보호 | server-only env | bundle/repo secret scan | A |
| R8 | 최소 문맥 유지 | 최근 5개 성공 Q/A | 후속 질문 테스트 | A |
| R9 | 질문/응답 누적 저장 | `chat_logs` | API + SQL | A |
| R10 | 최소 추적 필드 | user/time/question/answer 포함 | migration/ERD | A |
| R11 | 사용자 기준 조회 | `GET /api/me/chats` | 두 사용자 격리 테스트 | A/B |
| R12 | 4종 서버 이벤트 로그 | 구조화 로깅 | Vercel Runtime Logs 캡처 | A |
| R13 | AI timeout/실패 복구 | 25초 timeout, 오류 매핑 | respx 실패 테스트 | A |
| R14 | 사용자 오류 안내 | 공통 오류 UI/상태코드 | E2E | A/C |
| R15 | 입력 검증 | 빈 값 + 길이 제한 | 프런트/서버 테스트 | A/C |
| R16 | 배포/환경 문서 | README | 새 환경 재현 점검 | A |
| R17 | branch/feature/PR 흔적 | GitHub flow | PR 목록/graph | 전원 |
| R18 | 팀원별 10+ 유의미한 커밋 | 14/11/11 목표 | `git shortlog` 감사 | 전원 |
| R19 | 역할/작업 요약 | docs/team.md | Git/PR과 대조 | 전원 |
| R20 | 민감정보 관리 | `.env.example`, `.gitignore` | `git ls-files .env` | A |
| R21 | GitHub/README/API/DB 산출물 | 문서 패키지 | 최종 체크리스트 | 전원 |

README에는 반드시 아래 내용을 포함한다.

- 문제 정의, 타겟 사용자, 핵심 시나리오
- 시스템 아키텍처와 컴포넌트 역할
- API 요청/응답 예시
- ERD 또는 테이블/필드 설명
- 로컬 실행과 Vercel 배포
- 환경 변수 이름/용도/설정 위치
- 팀 역할과 실제 개인별 작업 요약
- DB 확인 방법
- 공개 서비스 URL과 GitHub URL

초기 환경 변수 목록:

| 이름 | 공개 여부 | 용도 |
|---|---|---|
| `SUPABASE_URL` | 공개 가능 | Supabase 프로젝트 URL |
| `SUPABASE_PUBLISHABLE_KEY` | 공개 가능 | Auth/Data API의 낮은 권한 키; RLS 필수 |
| `GEMINI_API_KEY` | 비공개 | Gemini API 인증 |
| `GEMINI_MODEL` | 설정값 | 배포별 Gemini 모델, 초기값 `gemini-3.8-flash` |
| `GEMINI_TIMEOUT_SECONDS` | 설정값 | 앱 수준 Gemini timeout, 기본 25 |
| `CONTEXT_TURNS` | 설정값 | 최근 문맥 개수, 기본 5 |
| `APP_ENV` | 설정값 | local/preview/production 구분 |

실제 값은 `.env`와 Vercel Environment Variables에만 저장하고 `.env.example`에는 이름과 안전한 예시만 둔다.

## 7. 3인 역할 분담

팀장 A는 Supabase, Vercel, FastAPI, Gemini API와 최종 통합을 맡고, 팀원 B와 C는 페이지 단위로 프런트엔드를 나누어 소유한다.

상세한 작업 목록, 파일 소유권, 커밋 후보와 공유용 설명은 [TEAM_ROLES_AND_ROADMAP.md](TEAM_ROLES_AND_ROADMAP.md)를 기준으로 한다.

| 담당 | 소유 범위 | 주요 결과물 | 목표 commit |
|---|---|---|---:|
| 팀장 A | 인프라·백엔드·AI·통합 | Supabase/RLS, Vercel, FastAPI API, Gemini, 로그, 테스트, 배포 | 14+ |
| 팀원 B | 공통 UI·인증·기록 | `/login`, `/signup`, `/history`, App Layout, Auth Provider | 11+ |
| 팀원 C | 채팅 UI | `/chat`, 메시지·입력·로딩·오류·재시도, 채팅 테스트 | 11+ |

### 팀장 A - 인프라·백엔드·AI·통합

- 아키텍처와 API 계약 최종 결정
- Supabase Auth 기본 설정, schema, GRANT, RLS
- FastAPI 앱, JWT 검증, 저장소와 보호 API
- Google Gemini API adapter, timeout, 오류 매핑
- 최근 N개 문맥 구성, request-id와 구조화 로그
- Vercel Preview/Production 배포
- 백엔드·통합 테스트와 최종 README/릴리스

### 팀원 B - 공통 UI·인증·대화 기록

- 프런트 라우팅과 공통 App Layout
- `/login`, `/signup`, `/history`
- Supabase browser client, 세션, Protected Route
- 입력 검증, 인증 오류, 로그아웃
- 기록 화면의 로딩·빈 목록·오류 상태
- 반응형·접근성·인증/기록 테스트

### 팀원 C - 채팅 페이지

- `/chat` 전체 레이아웃
- 사용자/AI 메시지와 질문 입력
- Bearer Token을 포함한 FastAPI 호출
- 로딩, 중복 전송 방지, timeout·실패·재시도 UI
- `conversation_id`, 자동 스크롤, 반응형·접근성
- 채팅 컴포넌트·통합 테스트

### 교차 리뷰

- A의 PR: B 또는 C가 리뷰
- B의 PR: C 우선, A 보조
- C의 PR: B 우선, A 보조
- `develop` → `main` 릴리스 PR: B와 C 모두 승인

## 8. Git/PR 전략

현재 `B7-1` 폴더는 독립 Git 저장소가 아니고, 상위 `/Users/sam/Documents/GitHub`의 아직 커밋 없는 저장소 아래에 있다. 다른 과제 폴더까지 함께 커밋할 위험이 있으므로 개발 시작 전에 `B7-1`을 독립 GitHub 저장소로 초기화한다.

브랜치:

- `main`: 평가 가능한 production
- `develop`: 통합/preview
- `feat/<owner>-<issue>`: 기능
- `fix/<owner>-<issue>`: 결함
- `docs/<owner>-<issue>`: 독립적인 유의미한 문서 작업

규칙:

- 모든 작업은 Issue와 연결한다.
- `main`과 `develop`에 직접 push하지 않는다.
- 최소 1명 승인 후 merge한다.
- GitHub merge 방식은 `Create a merge commit`을 사용한다.
- **Squash merge를 사용하지 않는다.** 팀원별 개별 commit이 최종 history에서 사라질 수 있다.
- 각 팀원은 본인의 GitHub 계정과 연결된 name/email로 직접 commit한다.
- 빈 commit, 줄바꿈만 바꾼 commit, 의미 없는 쪼개기는 세지 않는다.
- 각 기능 commit은 코드, 테스트 또는 독립적으로 검증 가능한 문서 결과를 남긴다.

권장 PR 묶음:

1. A1: project foundation/Supabase/Vercel/API contract
2. B1: frontend routing/common layout
3. C1: chat page basic UI
4. A2: FastAPI auth/schema/repository
5. B2: login/signup/session/protected routes
6. C2: chat API/loading/error integration
7. A3: Gemini/context/timeout/logging
8. B3: history/accessibility/frontend tests
9. C3: chat responsive/accessibility/tests
10. A4: backend tests/deployment/final docs
11. Release: `develop` → `main`

최종 감사:

```bash
git shortlog -sne --all
git log --all --no-merges --pretty=format:'%an <%ae> %h %s'
git ls-files .env
```

마지막 명령의 결과는 비어 있어야 한다.

## 9. 단계별 개발 로드맵

일차와 시간에 고정하지 않고 각 단계의 완료 게이트를 통과하면 다음 단계로 이동한다. 상세 실행 항목은 [TEAM_ROLES_AND_ROADMAP.md](TEAM_ROLES_AND_ROADMAP.md)를 기준으로 한다.

| 단계 | 핵심 작업 | 완료 게이트 |
|---|---|---|
| 0. 계약·협업 기반 | Git author, 브랜치/PR 규칙, 화면/API/DB 계약, 환경 변수 확정 | 전원 기능 브랜치 작업 가능, 미결정 계약 없음 |
| 1. 프로젝트 기반 | A: Supabase/Vercel/FastAPI, B: 라우팅/Layout, C: 목업 채팅 UI | `/api/health` 성공, 모든 화면 경로 렌더링, 첫 PR 생성 |
| 2. 페이지 독립 구현 | B: 로그인/가입/기록, C: 채팅의 기본·로딩·오류 상태 | 실제 백엔드 없이 모든 화면 상태 확인 가능 |
| 3. 백엔드·AI·DB | JWT, RLS, Gemini, 문맥, 저장/조회, 구조화 로그 | 비로그인 401, 데이터 격리, AI timeout 통제 |
| 4. 수직 통합 | 로그인 → 질문 → Gemini → DB → 기록 조회 | Preview에서 전체 핵심 흐름 성공 |
| 5. 안정성·테스트 | 입력, 429/timeout/5xx, DB 실패, RLS, 접근성, 비밀정보 검사 | 자동 테스트 통과, 오류 후 health 정상 |
| 6. 문서·Git 감사 | README, API/ERD/배포/DB 확인, 개인별 작업, commit/PR 감사 | README 재현 가능, 전원 10+ commit, 문서와 Git 일치 |
| 7. Production | release PR, 외부망 Smoke Test, 로그·DB 증빙 | 공개 URL과 GitHub 저장소 제출 가능 |

게이트 실패 시 새 기능 추가를 멈추고 현재 단계의 통합 문제를 먼저 해결한다.

MVP 완료 전 제외할 항목:

- 관리자 대시보드
- 스트리밍 답변
- 소셜 로그인
- 여러 AI 모델 선택
- 메신저 연동
- 장기 기억/RAG
- 애니메이션 중심 UI

제외할 수 없는 항목:

- 실제 FastAPI의 Gemini API 호출
- 가입/로그인/서버 인증
- DB 저장/사용자별 조회
- 최근 N개 문맥
- timeout/실패/필수 로그
- 공개 배포와 README
- 팀원별 유의미한 commit 10회 이상과 PR 기록

## 10. 테스트와 출시 게이트

| 테스트 | 기대 결과 | 담당 |
|---|---|---|
| 비로그인 `/api/chat` | 401, AI 호출 없음 | A |
| 회원가입/로그인/로그아웃 | 상태에 따라 화면과 기능 변경 | B |
| 정상 질문 | 실제 AI 답변이 같은 화면에 표시 | A/C |
| 문맥 후속 질문 | 같은 대화의 최근 5개 Q/A 반영 | A/C |
| DB 저장 | user/time/question/answer 확인 | A |
| 사용자 격리 | A가 B 로그를 조회하지 못함 | A |
| 빈 입력/2,000자 초과 | client와 server 모두 차단 | A/C |
| AI timeout | 504 + 안전한 안내, health 정상 | A |
| AI 일반 실패 | 502 + 실패 로그, health 정상 | A |
| DB 실패 | 503 + `db_save_failure`, 성공으로 위장하지 않음 | A |
| 필수 로그 | 요청/AI 시작/성공·실패/DB 결과 확인 | A |
| 공개 URL | 외부망에서 전체 흐름 성공 | 전원 |
| README 재현 | 새 환경에서 실행 가능 | 전원 |
| 비밀정보 | 추적된 실제 `.env`/키 없음 | A |
| Git | 각자 non-merge 10+, PR/branch 기록 존재 | 전원 |

최종 완료는 테스트 통과만 의미하지 않는다. 아래가 동시에 만족되어야 한다.

- Production URL 정상
- GitHub Repository 공개/제출 가능
- DB 조회 증빙 가능
- 필수 서버 로그 확인 가능
- README만 보고 설치/배포 가능
- 민감정보 노출 없음
- 팀원 3명 모두 10개 이상의 유의미한 commit
- 문서의 역할/개인별 작업과 실제 Git 이력 일치

## 11. 리스크와 대응

| 리스크 | 조기 신호 | 대응 |
|---|---|---|
| SQLite를 Vercel에 사용 | 재배포/인스턴스별 데이터 불일치 | 처음부터 Supabase 단일 DB 사용 |
| FastAPI를 상시 서버처럼 설계 | 메모리 문맥/로컬 파일 의존 | 모든 상태를 DB에 저장 |
| Supabase Data API 42501 | 새 테이블 permission denied | migration에 explicit GRANT + RLS |
| UI만 인증하고 API는 열림 | curl로 비로그인 chat 성공 | 모든 보호 route에서 JWT 검증 |
| AI API가 Vercel timeout까지 대기 | 504 platform error | 앱 timeout 25초, Function 60초 |
| service key 노출 | bundle/log에 secret 발견 | 브라우저에는 publishable만, secret은 server-only 또는 미사용 |
| 가입 후 로그인 불가 | confirmation 메일/redirect 미도착 | 평가용 email confirmation 설정을 조기 확정하고 E2E 검증 |
| commit 수 부족 | 통합 단계 전에 10개 미만 | 기반 단계부터 의미 단위 commit ledger 확인 |
| squash로 commit 소실 | merge 후 author count 감소 | merge commit 방식 고정 |
| 문서와 Git 불일치 | 역할표에 실제 PR이 없음 | 최종 문서는 merged PR 기준 갱신 |
| 짧은 일정의 범위 폭주 | 스트리밍/관리자 기능부터 개발 | MVP 필수 게이트 전 선택 기능 금지 |

Vercel 관련 팀 논의의 세부 검증과 호스팅 변경 조건은 [TEAM_ROLES_AND_ROADMAP.md의 Vercel 관련 우려 검증 및 대응](TEAM_ROLES_AND_ROADMAP.md#6-vercel-관련-우려-검증-및-대응)을 기준으로 한다.

## 12. 공식 기술 근거

- [Vercel FastAPI 공식 문서](https://vercel.com/docs/frameworks/backend/fastapi)
- [Vercel Python Runtime](https://vercel.com/docs/functions/runtimes/python)
- [Vercel Functions Limits](https://vercel.com/docs/functions/limitations)
- [Vercel에서 SQLite 지원 여부](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel)
- [Supabase DB 연결 방식](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase Python get_user](https://supabase.com/docs/reference/python/auth-getuser)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [2026 Data API explicit GRANT 변경](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)
- [Supabase migration](https://supabase.com/docs/guides/local-development/database-migrations)
- [Google GenAI SDK](https://ai.google.dev/gemini-api/docs/libraries)
- [Gemini 모델 목록](https://ai.google.dev/gemini-api/docs/models)

## 13. 개발 착수 순서

1. 확정된 Vercel, FastAPI, Supabase, Gemini 스택을 전원에게 공유한다.
2. `B7-1`을 독립 GitHub 저장소로 초기화한다.
3. A/B/C를 실명으로 바꾸고 Git author를 확인한다.
4. Supabase 프로젝트와 Gemini API key를 준비한다.
5. 단계별 로드맵의 단계 0부터 시작한다.
