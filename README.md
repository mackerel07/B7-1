# B7-1 - 웹 기반 AI 챗봇 서비스

로그인한 사용자의 질문을 FastAPI 서버가 Google Gemini에 전달하고, 답변과 대화 기록을 사용자별로 저장·조회하는 웹 서비스입니다.

- Production: <https://b7-1.vercel.app>
- API 문서: <https://b7-1.vercel.app/api/docs>
- 상태 확인: <https://b7-1.vercel.app/api/health>

## 프로젝트 개요

- **문제:** 여러 사용자가 안전하게 AI에게 질문하고 이전 대화를 이어갈 수 있어야 합니다.
- **대상:** 로그인 기반 AI 챗봇을 사용하는 일반 웹 사용자입니다.
- **핵심 시나리오:** 회원가입·로그인 → 질문 입력 → AI 답변 확인 → 본인 대화 기록 조회입니다.

## 기술 스택

| 영역 | 기술 |
|---|---|
| 프런트엔드 | Vite, React, TypeScript |
| 백엔드 | Python 3.12, FastAPI |
| AI | Google Gemini API, `google-genai` |
| 인증 | Supabase Auth |
| 데이터베이스 | Supabase PostgreSQL |
| 배포 | Vercel Services |

SQLite는 과제의 권장 사항이지만 필수는 아닙니다. Vercel Function의 로컬 파일은 영속·공유 저장소로 사용할 수 없으므로, 여러 함수 인스턴스가 같은 데이터를 안전하게 공유할 수 있는 Supabase PostgreSQL을 사용했습니다.

## 시스템 구조

```text
사용자 브라우저
  ├─ React UI
  ├─ Supabase Auth 회원가입·로그인
  └─ Bearer access token과 질문 전송
                 │
                 ▼
Vercel FastAPI Function
  ├─ Supabase Auth에서 token 검증
  ├─ 최근 성공 대화 5개 조회
  ├─ Gemini API 호출(25초 timeout)
  ├─ 질문·답변 PostgreSQL 저장
  └─ JSON 응답 및 구조화 서버 로그
                 │
                 ▼
Supabase Auth + Data API + PostgreSQL
```

프런트와 FastAPI는 `vercel.json`의 두 Service로 함께 배포됩니다. `/api/*`는 FastAPI로, 나머지 경로는 Vite 정적 앱으로 연결됩니다. 운영 DB는 Vercel이나 사용자 PC가 아니라 Supabase의 관리형 PostgreSQL에서 실행됩니다.

## 주요 기능

- 이메일·비밀번호 회원가입, 로그인, 로그아웃
- 비로그인 사용자의 `/chat`, `/history` 접근 차단
- 서버에서만 Gemini API 호출
- 같은 사용자·`conversation_id`의 최근 성공 Q/A 5개로 문맥 구성
- 질문·답변·사용자·시각·모델·지연시간·요청 ID 저장
- 로그인 사용자의 본인 기록만 조회
- 빈 질문, 2,000자 초과, 잘못된 UUID와 조회 범위 검증
- Gemini timeout과 외부 서비스 실패 시 통제된 오류 응답
- 요청, AI 호출, DB 저장 결과의 구조화 로그

## API

모든 보호 API는 다음 헤더가 필요합니다.

```http
Authorization: Bearer <Supabase access token>
```

### `POST /api/chat`

```json
{
  "question": "앞서 이야기한 내용을 요약해 주세요.",
  "conversation_id": "선택 사항인 UUID"
}
```

성공 시 `201 Created`:

```json
{
  "id": "chat log UUID",
  "conversation_id": "conversation UUID",
  "answer": "AI 답변",
  "model": "gemini-3.8-flash",
  "created_at": "2026-09-14T06:29:33.792190+00:00"
}
```

### `GET /api/me/chats?limit=20`

본인의 성공 대화 기록을 최신순으로 반환합니다. `limit`은 1~100입니다.

오류는 다음 공통 형식을 사용합니다.

```json
{
  "error": {
    "code": "AI_TIMEOUT",
    "message": "AI 응답 시간이 초과되었습니다. 다시 시도해 주세요.",
    "request_id": "요청 추적 ID"
  }
}
```

세부 계약은 [docs/API_CONTRACT.md](docs/API_CONTRACT.md)를 참고해 주세요.

## DB 구조

`public.chat_logs` 한 행이 성공한 질문·답변 한 쌍을 나타냅니다.

| 필드 | 설명 |
|---|---|
| `id` | 로그 UUID, Primary Key |
| `user_id` | `auth.users.id` Foreign Key |
| `conversation_id` | 같은 대화를 묶는 UUID |
| `question`, `answer` | 사용자 질문과 AI 답변 |
| `status`, `error_code` | 처리 상태와 선택적 오류 코드 |
| `request_id` | API 응답·서버 로그·DB 행을 연결하는 ID |
| `ai_model`, `latency_ms` | AI 모델과 Gemini 호출 지연시간 |
| `created_at` | 생성 시각 |

`authenticated` 역할에는 `SELECT`, `INSERT`만 허용합니다. RLS 정책은 `auth.uid() = user_id`를 적용하여 본인 행만 조회·삽입할 수 있게 합니다.

- Migration: [supabase/migrations/20260906070531_create_chat_logs.sql](supabase/migrations/20260906070531_create_chat_logs.sql)
- 확인 SQL: [scripts/check_logs.sql](scripts/check_logs.sql)

## 환경 변수

| 이름 | 위치 | 용도 |
|---|---|---|
| `SUPABASE_URL` | 서버 | Supabase 프로젝트 URL |
| `SUPABASE_PUBLISHABLE_KEY` | 서버 | Auth/Data API 공개 가능 키 |
| `GEMINI_API_KEY` | 서버 전용 | Gemini API secret |
| `GEMINI_MODEL` | 서버 | Gemini 모델 ID |
| `GEMINI_TIMEOUT_SECONDS` | 서버 | Gemini timeout, 기본 25초 |
| `SUPABASE_TIMEOUT_SECONDS` | 서버 | Supabase HTTP timeout, 기본 8초 |
| `CHAT_CONTEXT_LIMIT` | 서버 | 최근 문맥 개수, 기본 5개 |
| `LOG_LEVEL`, `CORS_ORIGINS` | 서버 | 로그 수준과 개발 origin |
| `VITE_SUPABASE_URL` | 브라우저 | Supabase Auth URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | 브라우저 | 공개 가능한 Auth 키 |
| `VITE_API_BASE_URL` | 브라우저, 선택 | 별도 API origin 사용 시 설정 |

실제 값은 로컬 `.env`/`frontend/.env.local` 또는 Vercel Environment Variables에만 저장합니다. `.env` 파일과 `.vercel`은 Git에서 제외되며, `.env.example`에는 필수 변수 이름과 예시만 기록합니다.

## 로컬 실행

Python 3.12와 Node.js가 필요합니다.

```bash
cp .env.example .env
# .env의 실제 값을 설정합니다.

uv sync --frozen
uv run uvicorn app.app:app --reload --host 127.0.0.1 --port 8000
```

별도 터미널에서 프런트엔드를 실행합니다.

```bash
cd frontend
cp ../.env.example .env.local
# VITE_ 변수를 실제 값으로 설정합니다.
npm ci
npm run dev
```

Vite 개발 서버는 `/api`를 `http://127.0.0.1:8000`으로 proxy합니다.

## 검증

```bash
uv run ruff check app

cd frontend
npm test
npm run build

curl https://b7-1.vercel.app/api/health
curl https://b7-1.vercel.app/api/ready
```

DB 기록은 Supabase SQL Editor에서 [scripts/check_logs.sql](scripts/check_logs.sql)을 실행하거나, 로그인 후 `/history` 또는 `GET /api/me/chats`로 확인합니다. 질문·답변 원문은 외부에 공유하지 않습니다.

## 운영 안정성

- Supabase Auth·DB HTTP 요청: 각 8초 timeout
- Gemini API: 전체 25초 timeout, 선택한 일시 오류에 제한적 재시도
- Vercel FastAPI Function: 최대 60초
- 브라우저 API 요청: 50초 timeout
- 주요 상태코드: `401`, `422`, `502`, `503`, `504`
- 서버 로그에는 질문·답변·JWT·API key·비밀번호를 기록하지 않습니다.

## 팀 역할과 작업 요약

| 구성원 | 역할 | 실제 작업 요약 | main 유의미한 커밋 |
|---|---|---|---:|
| [mackerel07](https://github.com/mackerel07) | 팀장·백엔드·인프라 | FastAPI, Supabase schema/RLS, Gemini, 로그·오류, Vercel 통합·배포 | 13 |
| [YiJuseong](https://github.com/YiJuseong) | 인증·공통 UI·기록 | 회원가입·로그인, AuthContext, ProtectedRoute, 공통 레이아웃, `/history`, 접근성 | 14 |
| [minyong96](https://github.com/minyong96) | 채팅 UI | 채팅 입력·메시지, API 오류·재시도, conversation 상태 복원, 중복 전송 방지·테스트 | 10 |

상세 역할과 진행 기준은 [팀 역할·개발 로드맵](docs/TEAM_ROLES_AND_ROADMAP.md)을 참고해 주세요.

## Git 협업

- `main`: Production
- `develop`: 기능 통합
- `feat/*`, `hotfix/*`: 기능·수정 브랜치
- 기능은 PR의 merge commit으로 반영하여 개인 커밋 이력을 유지합니다.

현재 저장소에는 기능 PR과 `develop → main` 릴리스 PR의 merge 기록이 있으며, 세 구성원 모두 PDF 기준인 유의미한 non-merge 커밋 10개 이상을 충족합니다.

## 문서

- [API 계약](docs/API_CONTRACT.md)
- [팀 역할·개발 로드맵](docs/TEAM_ROLES_AND_ROADMAP.md)
