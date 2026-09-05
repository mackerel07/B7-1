# Frontend

Vite + React + TypeScript UI for Context chat.

## Routes

| Path | Access | Purpose |
|---|---|---|
| `/login` | public | 이메일/비밀번호 로그인 |
| `/signup` | public | 회원가입 |
| `/chat` | protected | 질문 입력과 AI 응답 |
| `/history` | protected | 내 대화 기록 |

## Scripts

```bash
cd frontend
npm install
npm run dev
npm test
```

Local API calls under `/api` are proxied to `http://127.0.0.1:8000`.

Required env vars (see root `.env.example`):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_API_BASE_URL` (optional; leave empty to use same-origin `/api`)
