-- Supabase SQL Editor에서 평가·운영 확인용으로 실행합니다.
-- 사용자 질문/답변 원문이 포함되므로 관리자만 실행하고 결과를 외부에 공유하지 마십시오.
select
    id,
    user_id,
    conversation_id,
    status,
    request_id,
    ai_model,
    latency_ms,
    created_at,
    question,
    answer,
    error_code
from public.chat_logs
order by created_at desc
limit 50;

-- 특정 사용자의 요청 흐름 확인 예시:
-- select *
-- from public.chat_logs
-- where user_id = '사용자 UUID'::uuid
-- order by created_at desc;

