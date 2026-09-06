# B7-1 API 계약

프론트엔드와 백엔드는 아래 계약을 기준으로 병렬 개발합니다.

## 공통 규칙

- 기본 경로: `/api`
- 인증이 필요한 요청: `Authorization: Bearer <Supabase access token>`
- 요청·응답 본문: `application/json`
- 모든 응답 헤더: `X-Request-ID`
- 오류 형식:

```json
{
  "error": {
    "code": "AI_TIMEOUT",
    "message": "AI 응답 시간이 초과되었습니다. 다시 시도해 주세요.",
    "request_id": "요청 추적 ID"
  }
}
```

## 상태 확인

### `GET /api/health`

인증 없이 프로세스 동작 여부를 확인합니다.

```json
{"status": "ok"}
```

### `GET /api/ready`

필수 환경변수 설정 여부를 확인합니다. 값 자체는 노출하지 않습니다.

## 채팅 생성

### `POST /api/chat`

로그인이 필요합니다. `conversation_id`를 생략하면 새 대화가 시작됩니다. 같은 값을 다시 보내면 최근 성공 대화 5개가 문맥으로 전달됩니다.

요청:

```json
{
  "question": "앞서 이야기한 내용을 요약해 주세요.",
  "conversation_id": "2c3185ce-3ef4-4db6-bffe-82177f89a443"
}
```

응답(`201 Created`):

```json
{
  "id": "80e0ca7c-7ba1-4c5d-a296-3eb43220a437",
  "conversation_id": "2c3185ce-3ef4-4db6-bffe-82177f89a443",
  "answer": "답변 내용",
  "model": "gemini-3.8-flash",
  "created_at": "2026-09-04T01:30:00+00:00"
}
```

질문은 앞뒤 공백을 제거한 뒤 1자 이상 2,000자 이하여야 합니다. 전송 버튼은 응답이 끝날 때까지 비활성화하여 중복 요청을 막습니다.

## 내 대화 기록

### `GET /api/me/chats?limit=20`

로그인이 필요합니다. 최신순으로 본인 기록만 반환합니다. `limit`은 1~100입니다.

```json
{
  "items": [
    {
      "id": "80e0ca7c-7ba1-4c5d-a296-3eb43220a437",
      "conversation_id": "2c3185ce-3ef4-4db6-bffe-82177f89a443",
      "question": "질문 내용",
      "answer": "답변 내용",
      "model": "gemini-3.8-flash",
      "created_at": "2026-09-04T01:30:00+00:00"
    }
  ]
}
```

## 주요 오류 코드

| HTTP | 코드 | 화면 처리 |
|---:|---|---|
| 401 | `AUTH_REQUIRED`, `AUTH_INVALID_TOKEN` | 로그인 화면으로 이동합니다. |
| 422 | `VALIDATION_ERROR` | 입력 내용을 확인합니다. |
| 502 | `AI_SERVICE_ERROR` | 재시도 안내를 표시합니다. |
| 503 | `DATABASE_ERROR`, `DATABASE_UNAVAILABLE` | 잠시 후 재시도하도록 안내합니다. |
| 504 | `AI_TIMEOUT` | 시간 초과 안내와 재시도 버튼을 표시합니다. |

