# 팀원 B 작업 노트

작성자: YiJuseong  
브랜치: `feat/b-auth-frontend`  
기반: `codex/leader-foundation`

다른 팀원이 프론트 연동·리뷰할 때 참고용으로 남긴 개인 작업 기록입니다.

## 구현해 둔 것

### 화면 경로

| 경로 | 설명 |
|---|---|
| `/login` | 이메일/비밀번호 로그인 |
| `/signup` | 회원가입 + 클라이언트 입력 검증 |
| `/chat` | 질문 입력, AI 응답 표시, 로딩/오류/재시도 |
| `/history` | 내 대화 기록 목록 (로딩·빈 목록·오류) |

비로그인 사용자가 `/chat`, `/history`에 들어가면 `/login`으로 보냅니다.

### 주요 코드 위치

- `frontend/src/lib/supabase.ts` — Supabase browser client
- `frontend/src/contexts/AuthContext.tsx` — 세션 / access token / 로그인·가입·로그아웃
- `frontend/src/lib/api.ts` — `POST /api/chat`, `GET /api/me/chats` (Bearer 토큰)
- `frontend/src/components/auth/ProtectedRoute.tsx` — 보호 라우트
- `frontend/src/components/layout/AppShell.tsx` — 헤더, 메뉴, 로그아웃
- `frontend/src/pages/*` — 각 화면

### 프론트에서 기대하는 API

- `POST /api/chat`  
  요청: `{ "question": string, "conversation_id"?: uuid }`  
  응답: `{ id, conversation_id, answer, model, created_at }`
- `GET /api/me/chats?limit=20`  
  응답: `{ items: [{ id, conversation_id, question, answer, model, created_at }] }`
- 오류 형태: `{ error: { code, message, request_id } }`

로컬 개발 시 Vite가 `/api`를 `http://127.0.0.1:8000`으로 프록시합니다.

### 필요한 환경 변수

루트 `.env.example` 기준:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_API_BASE_URL` (선택, 비우면 same-origin `/api`)

### 로컬에서 프론트만 확인

```bash
cd frontend
npm install
npm run dev
npm test
```

단위 테스트는 키 없이 동작합니다. (현재 19개)

## 아직 못 돌린 테스트 (키·실환경 필요)

아래는 UI/클라이언트 코드는 준비됐지만, Supabase·백엔드·AI 키가 없어 **실연동으로 확인하지 못한** 항목입니다.

1. 실제 회원가입 → 로그인 → 로그아웃
2. 로그인 후 `/chat`에서 질문 → AI 응답이 같은 화면에 표시되는지
3. `/history`에 본인 기록이 쌓이는지
4. 비로그인 API 호출이 401로 막히는지 (서버 쪽과 함께 확인)
5. AI timeout / API 실패 시 프론트 오류 안내·다시 시도가 실제로 뜨는지
6. Preview/Production URL에서 end-to-end smoke

키가 준비되면 위 순서대로 보면 됩니다. 프론트 쪽 수정이 필요하면 이 브랜치에서 이어서 잡으면 됩니다.

## 팀에 부탁하고 싶은 것

- 공용 Supabase URL / publishable key, (가능하면) 로컬 FastAPI 기동 방법
- chat / history API 계약이 바뀌면 `frontend/src/lib/api.ts` 타입과 맞춰 주세요
- `/chat`은 문서상 팀원 2 범위와 겹칠 수 있어, merge 전에 담당만 한 번 맞춰 주시면 좋습니다
