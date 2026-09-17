# 에러 명세 (Error Spec)

이 문서는 B7-1의 **모든 에러**를 한곳에 모읍니다. 서버가 어떤 에러를 어떤 형태로 내보내고,
클라이언트가 그것을 어떻게 받아 화면에 보여주는지를 정의합니다.

관련 문서: [API_CONTRACT.md](./API_CONTRACT.md) (엔드포인트 계약),
[frontend/chat-process.md](../frontend/chat-process.md) (채팅 흐름의 배경 설명)

---

## 1. 전체 구조

에러는 **두 층**에서 만들어집니다. 클라이언트는 서버 에러만 다루는 게 아니라,
서버에 닿기 전·닿지 못한 상황에서 자기 에러를 직접 만듭니다.

```
[사용자 입력]
   │
   ├─ (A) 요청 전 검증 실패 ──────────► 필드 아래 인라인 에러, 요청 안 나감
   │
   ▼
[fetch]
   │
   ├─ (B) 응답 없음 (타임아웃·네트워크) ─► ApiError(status: 0), 클라이언트가 생성
   │
   ▼
[FastAPI]
   │
   ├─ AppError ─────────┐
   ├─ 검증 실패 ─────────┼─► 공통 JSON 형식 ─► (C) ApiError(status: 4xx/5xx)
   └─ 미처리 예외 ───────┘
```

핵심 원칙 세 가지:

1. **서버는 코드(문자열)로 구분하고, 클라이언트는 status로 판단한다.** 재시도 여부는
   `status` 하나로 정하기 때문에, 계약서에 없는 코드가 새로 생겨도 규칙이 그대로 적용됩니다.
2. **화면에 무관한 처리는 `lib/api.ts` 한 곳에서 한다.** 401 세션 정리가 대표적입니다.
   페이지마다 401을 처리하지 않습니다.
3. **모든 에러는 `ApiError` 하나의 타입으로 수렴한다.** 화면은 타입 분기를 하지 않습니다.

---

## 2. 서버

### 2.1 응답 형식

모든 에러 응답은 예외 없이 같은 모양입니다. (`app/core/errors.py:22`)

```json
{
  "error": {
    "code": "AI_TIMEOUT",
    "message": "AI 응답 시간이 초과되었습니다. 다시 시도해 주세요.",
    "request_id": "0e5c…"
  }
}
```

422만 `details`가 추가로 붙습니다 (Pydantic의 `exc.errors()`).

`request_id`는 미들웨어(`app/app.py:33`)가 만듭니다. 요청에 `X-Request-ID` 헤더가 있고
`[A-Za-z0-9._:-]{1,100}` 패턴이면 그 값을 쓰고, 아니면 UUID를 새로 만듭니다. 응답 헤더에도
같은 값을 실어 보내므로, 본문을 파싱하지 못한 경우에도 클라이언트가 헤더에서 집어갈 수 있습니다.

### 2.2 에러 정의: `AppError`

```python
@dataclass
class AppError(Exception):
    code: str
    message: str
    status_code: int
```

서버에는 에러 클래스 계층이 없습니다. `AppError` 하나에 코드·문구·상태를 담아 던지고,
등록된 핸들러가 JSON으로 바꿉니다. (`app/core/errors.py:16`)

### 2.3 예외 핸들러 (3개)

| 핸들러 | 대상 | 결과 |
|---|---|---|
| `handle_app_error` | `AppError` | `exc.status_code` + 코드·문구 그대로 |
| `handle_validation_error` | `RequestValidationError` | 422 `VALIDATION_ERROR` + `details` |
| `handle_unexpected_error` | 그 외 모든 `Exception` | 500 `INTERNAL_ERROR`, 내부 사정은 감춤 |

마지막 핸들러가 중요합니다. 예상 못 한 예외가 스택트레이스나 내부 메시지로 새어 나가지 않고,
`unexpected_error` 이벤트로 **로그에만** 남습니다.

### 2.4 서버 에러 전체 목록

| status | 코드 | 문구 | 발생 위치 |
|---:|---|---|---|
| 401 | `AUTH_REQUIRED` | 로그인이 필요합니다. | `app/api/dependencies.py:19` |
| 401 | `AUTH_INVALID_TOKEN` | 로그인이 필요하거나 세션이 만료되었습니다. | `app/services/auth.py:39` |
| 422 | `VALIDATION_ERROR` | 요청 형식이 올바르지 않습니다. | `app/core/errors.py:37` (핸들러) |
| 500 | `INTERNAL_ERROR` | 서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요. | `app/core/errors.py:51` (핸들러) |
| 502 | `AI_SERVICE_ERROR` | AI 답변을 생성하지 못했습니다. 다시 시도해 주세요. | `app/services/chat.py:131` |
| 503 | `AI_RATE_LIMITED` | (서버 미구현 — 5.1 참조) | — |
| 503 | `AI_NOT_CONFIGURED` | AI 서비스 설정이 완료되지 않았습니다. | `app/services/gemini.py:17` |
| 503 | `AUTH_NOT_CONFIGURED` | 인증 서비스 설정이 완료되지 않았습니다. | `app/services/auth.py:16` |
| 503 | `AUTH_SERVICE_UNAVAILABLE` | 인증 서비스를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요. | `app/services/auth.py:32` |
| 503 | `AUTH_INVALID_RESPONSE` | 인증 응답을 확인할 수 없습니다. | `app/services/auth.py:48` |
| 503 | `DATABASE_NOT_CONFIGURED` | 데이터베이스 설정이 완료되지 않았습니다. | `app/repositories/chat_logs.py:29` |
| 503 | `DATABASE_UNAVAILABLE` | 대화 기록 저장소에 연결할 수 없습니다. | `app/repositories/chat_logs.py:58` |
| 503 | `DATABASE_ERROR` | 대화 기록을 처리하지 못했습니다. | `app/repositories/chat_logs.py:65` |
| 503 | `DATABASE_INVALID_RESPONSE` | 대화 기록 응답을 확인하지 못했습니다. | `chat_logs.py:77, 83, 113, 151, 187` |
| 504 | `AI_TIMEOUT` | AI 응답 시간이 초과되었습니다. 다시 시도해 주세요. | `app/services/chat.py:107` |

`_NOT_CONFIGURED` 계열은 환경 변수 누락입니다. 런타임 장애가 아니라 배포 설정 문제이므로,
사용자에게는 같은 503으로 보이지만 로그의 코드로 구분합니다.

### 2.5 422가 나오는 조건

`ChatRequest`(`app/schemas/chat.py`)의 제약입니다.

- `question`: 1–2000자. `mode="before"` 검증기가 먼저 `strip()`하므로 공백만 보내면 거부됩니다.
- `conversation_id`: UUID 형식이어야 합니다.
- `GET /api/me/chats`의 `limit`: 1–100.

클라이언트도 같은 규칙(공백·2000자)을 미리 검사하므로, 정상 경로에서 422는 거의 나오지
않습니다. 클라이언트 검사를 우회한 요청에 대한 최종 방어선입니다.

### 2.6 로깅

에러를 삼키지 않고 반드시 이벤트로 남깁니다. `request_id`와 `user_id`가 함께 기록되어
한 요청의 흐름을 추적할 수 있습니다.

| 이벤트 | 남기는 곳 |
|---|---|
| `ai_call_failure` (`reason`에 원인) | `app/services/chat.py` |
| `unexpected_error` (`exception_type`) | `app/core/errors.py` |

---

## 3. 클라이언트

### 3.1 에러 타입: `ApiError`

```ts
export class ApiError extends Error {
  readonly code: string;      // 서버 코드, 없으면 "HTTP_ERROR"
  readonly status: number;    // HTTP 상태, 응답을 못 받았으면 0
  readonly requestId: string; // 본문 → X-Request-ID 헤더 → "unknown"
}
```

`frontend/src/lib/api.ts:33`. 서버가 준 에러든 네트워크 실패든 이 타입 하나로 수렴하므로,
화면은 타입 분기 없이 `message`와 `code`만 읽습니다.

### 3.2 클라이언트 에러 전체 목록

#### (A) 요청 전 검증 — 서버에 가지 않음

| 대상 | 조건 | 문구 | 정의 위치 |
|---|---|---|---|
| 질문 | 공백 | 질문을 입력해 주세요. | `lib/api.ts:57` `validateQuestion` |
| 질문 | 2000자 초과 | 질문은 2,000자까지 입력할 수 있습니다. | 〃 |
| 이메일 | 공백 | 이메일을 입력해 주세요. | `lib/authValidation.ts` `validateEmail` |
| 이메일 | 형식 불일치 | 올바른 이메일 형식이 아닙니다. | 〃 |
| 비밀번호 | 공백 | 비밀번호를 입력해 주세요. | `lib/authValidation.ts` `validatePassword` |
| 비밀번호 | 6자 미만 | 비밀번호는 6자 이상이어야 합니다. | 〃 |
| 비밀번호 확인 | 불일치 | 비밀번호 확인이 일치하지 않습니다. | `pages/SignupPage.tsx:32` |
| 환경 변수 | Supabase 미설정 | Supabase 환경 변수가 설정되지 않았습니다. | `pages/LoginPage.tsx:39`, `SignupPage.tsx:43` |

이 에러들은 **배너가 아니라 해당 필드 아래**에 `role="alert"`로 표시되고,
`aria-invalid`·`aria-describedby`로 입력 요소와 연결됩니다. 입력을 고치면 즉시 사라집니다.

#### (B) 응답을 받지 못함 — 클라이언트가 직접 생성 (`status: 0`)

| 코드 | 조건 | 문구 |
|---|---|---|
| `CLIENT_TIMEOUT` | 50초 자체 타임아웃 (`api.ts:186`) | 응답을 받지 못했습니다. 질문이 이미 처리됐을 수 있으니 기록에서 확인한 뒤 다시 보내 주세요. |
| `NETWORK_ERROR` | fetch가 `TypeError`로 거부 — 네트워크 단절·DNS 실패·CORS 차단 (`api.ts:195`) | 네트워크에 연결할 수 없습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요. |

**왜 status를 0으로 두는가.** 5xx는 서버가 실패를 알려준 것이라 저장되지 않은 게 확실하지만,
타임아웃은 서버가 이미 처리를 마쳤을 수도 있습니다. 멱등성을 보장하지 않기로 했으므로
그대로 재전송하면 중복 저장이 될 수 있어, 문구를 다르게 두고 판단을 사용자에게 넘깁니다.

타임아웃을 50초로 잡은 이유는 서버 전체 상한(인증 8s + 문맥 조회 8s + Gemini 25s + 저장 8s)보다
길게 두기 위해서입니다. 짧게 잡으면 정상 처리 중인 요청을 클라이언트가 끊게 됩니다.

#### (C) 서버 응답 변환 — `HTTP_ERROR`

응답 본문이 JSON이 아니거나 `error.code`가 없으면 코드는 `HTTP_ERROR`, 문구는
"요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."가 됩니다. (`api.ts:114`)

#### (D) Supabase 인증 에러 — 문구 번역

Supabase는 영어 메시지를 던집니다. `authErrorMessage()`(`lib/authValidation.ts`)가
부분 문자열로 판별해 한국어로 바꿉니다.

| 원본에 포함된 문자열 | 표시 문구 |
|---|---|
| `invalid login credentials` | 이메일 또는 비밀번호가 올바르지 않습니다. |
| `user already registered` | 이미 가입된 이메일입니다. |
| `email` (위에 안 걸린 경우) | 이메일 관련 설정을 확인해 주세요. 잠시 후 다시 시도해 주세요. |
| 그 외 | 원본 메시지를 그대로 노출 |

마지막 줄은 의도된 절충입니다. 알려지지 않은 실패를 "알 수 없는 오류"로 덮으면 디버깅이
불가능해지므로, 영어라도 원문을 보여줍니다.

### 3.3 재시도 규칙 — `isRetryableError()`

재시도 버튼 노출을 결정하는 **단일 지점**입니다. (`api.ts:143`)

```ts
error.status === 0 || error.status >= 500
```

`ApiError`가 아닌 값(계약에 없는 실패)은 일시적일 수 있으므로 재시도를 허용합니다.

| status | 코드 | 재시도 | 근거 |
|---:|---|:---:|---|
| 0 | `CLIENT_TIMEOUT`, `NETWORK_ERROR` | ✅ | 응답을 못 받음. 일시적일 수 있다 |
| 401 | `AUTH_*` | — | 배너 없이 로그인 화면으로 이동 |
| 422 | `VALIDATION_ERROR` | ✕ | 요청을 고쳐야 하므로 다시 보내도 결과가 같다 |
| 500 | `INTERNAL_ERROR` | ✅ | 서버 측 일시적 실패 |
| 502 | `AI_SERVICE_ERROR` | ✅ | 서버 측 일시적 실패 |
| 503 | `AI_RATE_LIMITED`, `DATABASE_*`, `AUTH_*_UNAVAILABLE` | ✅ | 서버 측 일시적 실패 |
| 504 | `AI_TIMEOUT` | ✅ | 서버 측 일시적 실패 |

코드를 하나하나 나열하지 않은 이유는, 계약서에 없는 코드가 나와도 같은 규칙이 적용되게 하기
위해서입니다. 실제로 서버에는 계약서에 없는 코드가 여럿 있습니다(2.4의 표 참조).

### 3.4 문구를 덮어쓰는 예외 — `CLIENT_MESSAGES`

기본은 **서버 문구를 그대로 쓰는 것**입니다. 서버가 상황을 가장 잘 알고 있고, 문구를 고칠 때
클라이언트를 같이 배포하지 않아도 되기 때문입니다. 예외는 코드 단위로 등록합니다. (`api.ts:109`)

| 코드 | 고정 문구 | 이유 |
|---|---|---|
| `AI_RATE_LIMITED` | 너무 많은 요청으로 잠시 후 시도해 주세요. | 호출량 초과는 사용자가 할 일이 "잠시 뒤 다시 보내기" 하나뿐이라 서버 문구와 무관하게 안내가 같다 |

**status가 아니라 코드로 고른다**는 점이 중요합니다. 503은 `DATABASE_ERROR`,
`DATABASE_UNAVAILABLE`, `AUTH_SERVICE_UNAVAILABLE`도 함께 쓰는 상태라, status로 갈랐다면
DB 장애에 "너무 많은 요청" 안내가 나갔을 겁니다.

### 3.5 AI 호출 실패 3종

AI 호출이 실패하는 경로는 셋이고, 셋 다 요청 자체는 멀쩡하며 잠시 뒤에는 통합니다.
그래서 모두 재시도를 유도합니다.

| status | 코드 | 화면 문구 | 재시도 |
|---:|---|---|:---:|
| 502 | `AI_SERVICE_ERROR` | 서버 문구 ("AI 답변을 생성하지 못했습니다") | ✅ |
| 503 | `AI_RATE_LIMITED` | 고정 문구 ("너무 많은 요청으로 잠시 후 시도해 주세요") | ✅ |
| 504 | `AI_TIMEOUT` | 서버 문구 ("AI 응답 시간이 초과되었습니다") | ✅ |

셋 다 status가 500 이상이라 `isRetryableError()`가 그대로 잡습니다. 재시도 규칙에 예외를
추가할 필요가 없습니다.

### 3.6 401 전역 처리

401은 특정 화면의 문제가 아니라 세션 자체가 무효해진 상황입니다. 그래서 페이지가 아니라
`lib/api.ts:78`에서 한 번만 처리합니다.

```
401 응답 → clearSessionIfUnauthorized() → supabase.auth.signOut()
        → AuthContext의 onAuthStateChange가 user를 null로
        → ProtectedRoute가 /login으로 이동
```

세션 정리에 실패해도(네트워크 단절 등) 원래 에러는 그대로 호출자에게 던집니다.

`useChat`은 401일 때 `setError`조차 하지 않습니다(`hooks/useChat.ts:154`). 곧 화면이 바뀌므로
사라질 배너를 띄우지 않기 위해서입니다.

### 3.7 표시 방식

| 방식 | 쓰이는 곳 | 모양 |
|---|---|---|
| 필드 인라인 (`field__error`) | 요청 전 검증 (A) | 입력 요소 바로 아래, `aria-describedby`로 연결 |
| 배너 (`ErrorBanner`) | 요청 후 실패 (B)(C) | `role="alert"`, 코드 + 문구 + 선택적 재시도 버튼 |
| 폼 배너 (`alert alert--error`) | 로그인·가입 실패 (D) | 폼 하단, 코드 없음 |

`ErrorBanner`(`components/chat/ErrorBanner.tsx`)는 `ApiError` → `Error` → 알 수 없는 값 순으로
문구를 꺼내고, `ApiError`일 때만 코드를 제목에 붙입니다. `onRetry`가 없으면 버튼 자체를
그리지 않습니다.

---

## 4. 화면별 동작

### 4.1 채팅 (`ChatPage` + `useChat`)

```
send() → inFlightRef 잠금 → 낙관적으로 질문 말풍선 추가 → postChat()
   ├─ 성공: 답변 추가, confirmedRef·sessionStorage 갱신
   └─ 실패: 401이면 조용히 종료 / 그 외 setError → 배너
```

- **실패한 질문은 화면에 남지만 저장되지 않습니다.** sessionStorage에 쓰는 대상은 화면의
  `messages`가 아니라 서버가 성공 응답한 것만 모은 `confirmedRef`입니다. 실패한 질문까지
  저장하면 새로고침한 화면이 실제 서버 기록과 어긋납니다.
- **재시도는 질문을 다시 그리지 않습니다.** `isRetry: true`로 호출되어 말풍선 추가를
  건너뜁니다. 실패한 질문이 이미 화면에 있기 때문입니다.
- **중복 전송은 `inFlightRef`로 막습니다.** `setPending(true)`는 다시 그리라는 예약일 뿐이라
  같은 렌더의 클로저에서는 `pending`이 계속 false입니다. ref는 즉시 반영됩니다.

### 4.2 기록 (`HistoryPage`)

조회 실패 시 배너를 띄우고 `loadHistory`를 재시도로 넘깁니다. 로딩·에러·빈 목록 상태가
서로 배타적으로 렌더됩니다.

### 4.3 로그인·가입 (`LoginPage`, `SignupPage`)

필드 검증 → 환경 변수 확인 → Supabase 호출 순입니다. 앞 단계에서 걸리면 뒤로 가지 않습니다.
Supabase 실패는 `authErrorMessage()`를 거쳐 폼 하단 배너로 나옵니다.

### 4.4 보호 경로 (`ProtectedRoute`)

세션 확인 중에는 `aria-busy` 화면을, 사용자가 없으면 `/login`으로 리다이렉트합니다.
이때 `state.from`에 원래 경로를 실어 보냅니다.

---

## 5. 알려진 간극

### 5.1 `AI_RATE_LIMITED`를 서버가 아직 내지 않음

클라이언트는 준비되어 있지만, `app/services/chat.py:131`이 Gemini 호출 실패 전반을 502
`AI_SERVICE_ERROR`로 묶고 있어서 호출량 초과도 그리로 들어갑니다. 서버에서 quota 예외를
갈라 503 `AI_RATE_LIMITED`로 내보내야 이 경로가 실제로 동작합니다.

참고로 Gemini SDK는 `HttpRetryOptions`로 500·502·503·504에 한해 최대 두 번 자체 재시도합니다
([GEMINI_TROUBLESHOOTING.md](./GEMINI_TROUBLESHOOTING.md)). 사용자에게 보이는 실패는 그
재시도까지 모두 실패한 뒤입니다.

### 5.2 `HistoryPage`가 재시도 규칙을 쓰지 않음

`ErrorBanner`에 `onRetry`를 무조건 넘겨서(`HistoryPage.tsx:54`), 422처럼 재시도가 무의미한
에러에도 버튼이 나옵니다. 조회는 부작용이 없어 실질적 피해는 없지만 채팅과 판단 기준이
다릅니다. 맞추려면 `isRetryableError(error) ? loadHistory : undefined`로 바꾸면 됩니다.

### 5.3 `API_CONTRACT.md`의 표가 실제보다 좁음

계약서에는 401·422·502·503·504만 적혀 있지만 실제 코드에는 `AI_NOT_CONFIGURED`,
`DATABASE_NOT_CONFIGURED`, `DATABASE_INVALID_RESPONSE`, `AUTH_INVALID_RESPONSE`,
`INTERNAL_ERROR` 등이 더 있습니다. 클라이언트가 코드가 아니라 status로 판단하는 덕분에
문제가 되지 않지만, 계약서만 보고 구현하면 어긋납니다.

### 5.4 멱등성 없음

`POST /api/chat`은 멱등 키를 받지 않습니다. 타임아웃 후 재전송하면 서버가 이미 처리를
마쳤을 경우 중복 저장이 됩니다. 클라이언트가 `CLIENT_TIMEOUT` 문구로 사용자에게 확인을
요청하는 것이 현재의 대응입니다.

---

## 6. 테스트

| 검증 대상 | 위치 |
|---|---|
| 에러 변환, 401 세션 정리, 재시도 판정, AI 실패 3종 | `frontend/src/lib/api.test.ts` |
| 배너 표시, 재시도 동작, 실패 시 저장 제외 | `frontend/src/pages/ChatPage.test.tsx` |
| 코드·문구 렌더, 재시도 버튼 유무 | `frontend/src/components/chat/ErrorBanner.test.tsx` |
| 입력 검증 에러 | `frontend/src/components/chat/ChatInput.test.tsx`, `lib/validation.test.ts` |
| 리다이렉트 | `frontend/src/components/auth/ProtectedRoute.test.tsx` |

에러 문구를 바꿀 때는 이 문서와 해당 테스트를 함께 고쳐야 합니다.
