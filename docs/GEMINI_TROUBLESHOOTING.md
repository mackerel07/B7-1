# Gemini 오류 대응 기록

## 2026-09-06: 채팅 요청 실패

### 현상

`develop` Preview의 채팅 화면에서 질문을 전송하면 AI 답변 대신 오류 안내가 표시되었습니다.

### 확인 결과

- Supabase 사용자 인증 요청: `200 OK`
- 최근 대화 조회 요청: `200 OK`
- Gemini `generateContent` 요청: `503 Service Unavailable`
- FastAPI 응답: `AI_SERVICE_ERROR` (`502`)

인증과 DB 조회는 성공했으므로 Supabase 연결 문제가 아니며, Gemini API 호출 단계에서 실패한 것으로 확인했습니다. API 키나 모델 ID가 잘못된 경우가 아니라 Google 서버가 일시적으로 요청을 처리하지 못한 상황입니다.

### 원인

1. Google Gemini API가 일시적인 서버 오류인 `503`을 반환했습니다.
2. `gemini-3.8-flash` 설정에 더 이상 지원되지 않는 `temperature`를 전달하고 있었습니다.

Google 공식 마이그레이션 안내는 Gemini 3.8 Flash에서 `temperature`, `top_p`, `top_k` 같은 샘플링 매개변수를 제거하도록 명시합니다.

### 해결

- `GenerateContentConfig`에서 `temperature`를 제거했습니다.
- Google Gen AI SDK의 `HttpRetryOptions`를 사용해 `500`, `502`, `503`, `504`에 한해 최대 두 번 재시도하도록 설정했습니다.
- 재시도 간격은 짧은 지수 백오프로 설정했습니다.
- 기존 25초 애플리케이션 타임아웃과 사용자용 오류 응답은 유지했습니다.

### 검증 기준

1. Vercel Preview 빌드가 성공해야 합니다.
2. 로그인 사용자의 질문에 Gemini 답변이 표시되어야 합니다.
3. 성공한 질문과 답변이 `chat_logs`에 저장되어야 합니다.
4. 일시적인 `503` 발생 시 재시도하고, 최종 실패 시 기존 안전한 오류 안내를 반환해야 합니다.
5. API 실패 후에도 `/api/health`가 정상 응답해야 합니다.

### 참고 문서

- [Gemini 3.8 Flash의 새로운 기능 및 마이그레이션 안내](https://ai.google.dev/gemini-api/docs/latest-model?hl=ko)
