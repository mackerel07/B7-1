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
| AI 연동 | 단일 provider adapter + 공식 API/SDK | 공급자 변경 범위를 한 파일로 제한하고 키/모델/타임아웃을 환경 변수화 |
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
- 이메일 확인을 사용할 경우 redirect URL과 SMTP를 실제 배포 주소 기준으로 검증한다. 1~2일 평가용 MVP에서는 가입 직후 바로 로그인할 수 있도록 email confirmation을 끄고 그 설정을 README에 명시하는 편이 안정적이다.

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
| R3 | 같은 흐름에서 응답 표시 | chat message list | 브라우저 E2E | B |
| R4 | 외부 접속 URL | Vercel Production | 외부/시크릿 창 smoke | A |
| R5 | 회원가입/로그인 | Supabase Auth | 가입/로그인/로그아웃 E2E | B |
| R6 | 인증별 접근 구분 | UI guard + FastAPI JWT 검증 | 비로그인 API 401 | B/C |
| R7 | 서버에서 AI key 보호 | server-only env | bundle/repo secret scan | A |
| R8 | 최소 문맥 유지 | 최근 5개 성공 Q/A | 후속 질문 테스트 | A/C |
| R9 | 질문/응답 누적 저장 | `chat_logs` | API + SQL | C |
| R10 | 최소 추적 필드 | user/time/question/answer 포함 | migration/ERD | C |
| R11 | 사용자 기준 조회 | `GET /api/me/chats` | 두 사용자 격리 테스트 | C/B |
| R12 | 4종 서버 이벤트 로그 | 구조화 로깅 | Vercel Runtime Logs 캡처 | A |
| R13 | AI timeout/실패 복구 | 25초 timeout, 오류 매핑 | respx 실패 테스트 | A |
| R14 | 사용자 오류 안내 | 공통 오류 UI/상태코드 | E2E | A/B |
| R15 | 입력 검증 | 빈 값 + 길이 제한 | 프런트/서버 테스트 | A/B |
| R16 | 배포/환경 문서 | README | 새 환경 재현 점검 | A |
| R17 | branch/feature/PR 흔적 | GitHub flow | PR 목록/graph | 전원 |
| R18 | 팀원별 10+ 유의미한 커밋 | 14/12/12 목표 | `git shortlog` 감사 | 전원 |
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
| `AI_API_KEY` | 비공개 | AI provider 인증 |
| `AI_MODEL` | 설정값 | 배포별 모델 선택 |
| `AI_BASE_URL` | 설정값 | 선택한 provider endpoint |
| `AI_TIMEOUT_SECONDS` | 설정값 | 앱 수준 AI timeout, 기본 25 |
| `CONTEXT_TURNS` | 설정값 | 최근 문맥 개수, 기본 5 |
| `APP_ENV` | 설정값 | local/preview/production 구분 |

실제 값은 `.env`와 Vercel Environment Variables에만 저장하고 `.env.example`에는 이름과 안전한 예시만 둔다.

## 7. 3인 역할 분담

팀원 실명은 확정 후 A/B/C를 교체한다. 작업량은 **팀장 A 40%, 팀원 B 30%, 팀원 C 30%**로 배분한다.

### 팀장 A - Backend/AI/Integration/Release (40%, 목표 14+ commits)

소유 범위:

- 아키텍처와 API 계약 최종 결정
- FastAPI 앱/설정/의존성 골격
- `/api/chat` orchestration
- AI adapter, timeout, 오류 매핑
- 최근 N개 문맥 구성
- request-id와 구조화 로그
- Vercel 설정, preview/production 배포
- 통합 테스트와 최종 README/릴리스

유의미한 커밋 후보:

1. Python 프로젝트와 FastAPI entrypoint
2. settings 및 환경 변수 검증
3. health/public-config endpoint
4. API schema와 입력 검증
5. AI client interface
6. 실제 provider 구현
7. timeout/오류 매핑
8. 문맥 구성기
9. chat orchestration
10. request-id middleware
11. 구조화 이벤트 로그
12. AI 성공/실패 테스트
13. Vercel 설정/smoke script
14. 아키텍처/API/배포/릴리스 문서

### 팀원 B - Auth/Frontend/UX (30%, 목표 12+ commits)

소유 범위:

- React 화면 구조와 디자인
- Supabase browser client와 session 상태
- 회원가입/로그인/로그아웃
- 비로그인/로그인 화면 분기
- 채팅 메시지/입력/로딩/오류/재시도 UI
- Bearer token을 포함한 API client
- 내 대화 내역 화면
- 반응형/접근성/프런트 테스트

유의미한 커밋 후보:

1. Vite/React/TypeScript 골격
2. 공통 layout/theme
3. Supabase browser client
4. 회원가입 폼
5. 로그인/로그아웃
6. 인증 상태 guard
7. 질문 입력 검증
8. 메시지 목록/응답 렌더링
9. API client/Bearer token
10. 로딩/오류/재시도 UX
11. 대화 히스토리 화면
12. 접근성/반응형/프런트 테스트

### 팀원 C - Database/Auth Backend/Traceability (30%, 목표 12+ commits)

소유 범위:

- Supabase 프로젝트와 migration
- `chat_logs` 제약/인덱스/GRANT/RLS
- FastAPI JWT 검증 의존성
- Data API repository
- 대화 저장, 최근 문맥 조회, 내 로그 조회
- 다른 사용자 데이터 격리 테스트
- `scripts/check_logs.sql`, ERD, DB 확인 가이드
- DB 실패 처리와 로그

유의미한 커밋 후보:

1. Supabase 로컬 설정
2. chat_logs migration
3. 제약조건과 인덱스
4. explicit GRANT
5. SELECT RLS
6. INSERT RLS
7. JWT 검증 dependency
8. chat 저장 repository
9. 최근 문맥 조회 repository
10. `/api/me/chats`
11. RLS/DB 통합 테스트
12. check SQL/ERD/DB 문서

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

1. A1: project foundation/settings/API contract
2. C1: schema/index/GRANT/RLS
3. B1: auth UI/session/protected screen
4. A2: AI/context/error handling
5. C2: server auth/repository/history API
6. B2: chat UI/API integration
7. C3: DB verification/tests/docs
8. B3: history/accessibility/frontend tests
9. A3: logging/integration/deployment
10. A4: final docs/release audit
11. Release: `develop` → `main`

최종 감사:

```bash
git shortlog -sne --all
git log --all --no-merges --pretty=format:'%an <%ae> %h %s'
git ls-files .env
```

마지막 명령의 결과는 비어 있어야 한다.

## 9. 2일 로드맵 - 권장

### 1일차 09:00-10:00 - 계약과 협업 기반

- A: 독립 저장소, `main`/`develop`, Issue/PR template, Python 골격
- B: 프런트 골격과 화면 계약
- C: Supabase 프로젝트, schema/RLS/API 계약 검토
- 전원: Git author 확인, 환경 변수 이름 확정, API/DB contract 동의

완료 게이트:

- `/api/health` 로컬 성공
- migration 로컬/원격 적용 가능
- 프런트 첫 화면 실행
- 첫 PR 3개 생성

### 1일차 10:00-13:00 - 인증/AI/DB 병렬 구현

- A: settings, AI adapter, chat schema
- B: 가입/로그인/로그아웃, auth state
- C: migration, GRANT/RLS, JWT 검증, repository

### 1일차 14:00-17:00 - 핵심 수직 흐름

- A: 최근 5개 문맥 + AI timeout + 오류 매핑
- B: 질문/메시지/로딩/오류 UI + Bearer API client
- C: 저장/최근 문맥/내 로그 조회

### 1일차 17:00-18:00 - 첫 Preview 통합

- 로그인 → 질문 → 실제 AI 응답 → DB 저장 → 내 로그 조회
- 비로그인 `/api/chat` 401
- 두 사용자의 로그가 분리됨

게이트 실패 시 새 기능을 멈추고 통합 문제를 우선 해결한다.

### 2일차 09:00-11:00 - 운영 안정성

- 빈 입력/길이 제한의 client+server 이중 검증
- AI timeout/일반 실패 처리
- DB 저장 실패 처리
- 4종 필수 이벤트와 request_id 로그

### 2일차 11:00-13:00 - 자동 검증

- pytest 성공/401/422/timeout/upstream error/DB error
- 사용자 A가 B의 로그를 읽지 못하는 RLS 테스트
- 최근 N개 문맥 순서/한도 테스트
- 프런트 auth/chat/error 테스트
- `scripts/check_logs.sql` 검증

### 2일차 14:00-16:00 - 문서와 재현성

- README 전 항목 작성
- API 예시, ERD, 환경 변수, 실행/배포, DB 확인 가이드
- 팀 역할 문서는 예정이 아니라 실제 merged PR/commit 기준으로 갱신
- 깨끗한 환경에서 문서 순서대로 설치/실행

### 2일차 16:00-17:00 - Git/보안 감사

- 각 팀원 non-merge 10+ 유의미한 commits
- PR merge 기록과 feature branch 흔적
- `.env`/키/비밀번호/Authorization 로그 노출 검사
- 역할 문서와 Git history 대조

### 2일차 17:00-18:00 - Production 릴리스

- `develop` → `main` PR, B/C 승인
- Production 배포
- 외부망/시크릿 창에서 회원가입부터 로그 조회까지 smoke
- Vercel Runtime Logs에서 필수 이벤트 확인
- README에 GitHub URL/서비스 URL/검증 절차 기록

## 10. 1일 압축안

1일도 가능하지만, 빈 저장소에서 기능·문서·배포와 팀원별 10개 이상의 유의미한 commit을 동시에 만족해야 해 위험하다. 가능하면 2일안을 사용한다.

| 시간 | 전원 공통/통합 | A | B | C |
|---|---|---|---|---|
| 09:00-09:45 | 계약, Issue, Git 설정 | FastAPI 골격 | UI 골격 | Supabase/schema |
| 09:45-10:30 | 기반 PR merge | settings/health | auth client | migration/RLS |
| 10:30-13:00 | 병렬 핵심 구현 | AI/chat/context | 가입/로그인/chat UI | JWT/repository/history |
| 13:00-13:45 | 1차 리뷰/merge | 통합 지원 | 통합 지원 | 통합 지원 |
| 13:45-16:30 | vertical flow | timeout/logging | 실제 API 연결 | 저장/조회/격리 |
| 16:30-17:15 | Preview | deploy | UI smoke | DB 확인 |
| 17:15-19:00 | 실패/E2E | backend tests | frontend tests | RLS/DB tests |
| 19:00-20:30 | 문서/Git 감사 | README/release | UI/개인 요약 | ERD/SQL/개인 요약 |
| 20:30-21:30 | Production | release | 외부 smoke | 로그/DB smoke |

압축안에서 제외할 항목:

- 관리자 대시보드
- 스트리밍 답변
- 소셜 로그인
- 여러 AI 모델 선택
- 메신저 연동
- 장기 기억/RAG
- 애니메이션 중심 UI

제외할 수 없는 항목:

- 실제 FastAPI AI 호출
- 가입/로그인/서버 인증
- DB 저장/사용자별 조회
- 최근 N개 문맥
- timeout/실패/필수 로그
- 공개 배포와 README
- 팀원별 유의미한 commit 10회 이상과 PR 기록

## 11. 테스트와 출시 게이트

| 테스트 | 기대 결과 | 담당 |
|---|---|---|
| 비로그인 `/api/chat` | 401, AI 호출 없음 | C/A |
| 회원가입/로그인/로그아웃 | 상태에 따라 화면과 기능 변경 | B |
| 정상 질문 | 실제 AI 답변이 같은 화면에 표시 | A/B |
| 문맥 후속 질문 | 같은 대화의 최근 5개 Q/A 반영 | A/C |
| DB 저장 | user/time/question/answer 확인 | C |
| 사용자 격리 | A가 B 로그를 조회하지 못함 | C |
| 빈 입력/2,000자 초과 | client와 server 모두 차단 | A/B |
| AI timeout | 504 + 안전한 안내, health 정상 | A |
| AI 일반 실패 | 502 + 실패 로그, health 정상 | A |
| DB 실패 | 503 + `db_save_failure`, 성공으로 위장하지 않음 | A/C |
| 필수 로그 | 요청/AI 시작/성공·실패/DB 결과 확인 | A |
| 공개 URL | 외부망에서 전체 흐름 성공 | A/B |
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

## 12. 리스크와 대응

| 리스크 | 조기 신호 | 대응 |
|---|---|---|
| SQLite를 Vercel에 사용 | 재배포/인스턴스별 데이터 불일치 | 처음부터 Supabase 단일 DB 사용 |
| FastAPI를 상시 서버처럼 설계 | 메모리 문맥/로컬 파일 의존 | 모든 상태를 DB에 저장 |
| Supabase Data API 42501 | 새 테이블 permission denied | migration에 explicit GRANT + RLS |
| UI만 인증하고 API는 열림 | curl로 비로그인 chat 성공 | 모든 보호 route에서 JWT 검증 |
| AI API가 Vercel timeout까지 대기 | 504 platform error | 앱 timeout 25초, Function 60초 |
| service key 노출 | bundle/log에 secret 발견 | 브라우저에는 publishable만, secret은 server-only 또는 미사용 |
| 가입 후 로그인 불가 | confirmation 메일/redirect 미도착 | 평가용 email confirmation 설정을 조기 확정하고 E2E 검증 |
| commit 수 부족 | 2일차 오후 10개 미만 | 첫날부터 의미 단위 commit ledger 확인 |
| squash로 commit 소실 | merge 후 author count 감소 | merge commit 방식 고정 |
| 문서와 Git 불일치 | 역할표에 실제 PR이 없음 | 최종 문서는 merged PR 기준 갱신 |
| 짧은 일정의 범위 폭주 | 스트리밍/관리자 기능부터 개발 | MVP 필수 게이트 전 선택 기능 금지 |

## 13. 공식 기술 근거

- [Vercel FastAPI 공식 문서](https://vercel.com/docs/frameworks/backend/fastapi)
- [Vercel Python Runtime](https://vercel.com/docs/functions/runtimes/python)
- [Vercel Functions Limits](https://vercel.com/docs/functions/limitations)
- [Vercel에서 SQLite 지원 여부](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel)
- [Supabase DB 연결 방식](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase Python get_user](https://supabase.com/docs/reference/python/auth-getuser)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [2026 Data API explicit GRANT 변경](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)
- [Supabase migration](https://supabase.com/docs/guides/local-development/database-migrations)

## 14. 개발 착수 순서

1. 이 계획의 스택과 AI provider만 팀에서 최종 확인한다.
2. `B7-1`을 독립 GitHub 저장소로 초기화한다.
3. A/B/C를 실명으로 바꾸고 Git author를 확인한다.
4. Supabase 프로젝트와 AI API key를 준비한다.
5. 2일 로드맵의 1일차 09:00 작업부터 시작한다.
