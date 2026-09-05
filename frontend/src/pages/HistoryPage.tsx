import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { ErrorBanner } from "../components/chat/ErrorBanner";
import { useAuth } from "../contexts/AuthContext";
import { fetchMyChats, type ChatHistoryItem } from "../lib/api";

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function HistoryPage() {
  const { user, accessToken, signOut } = useAuth();
  const [items, setItems] = useState<ChatHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const loadHistory = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetchMyChats({ accessToken, limit: 50 });
      setItems(response.items);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  return (
    <AppShell email={user?.email} onLogout={() => void signOut()}>
      <main className="page history-page">
        <div className="history-page__header">
          <p className="eyebrow">Context</p>
          <h1>내 대화 기록</h1>
          <p className="lede">로그인한 사용자의 질문과 응답만 표시됩니다.</p>
        </div>

        {error ? <ErrorBanner error={error} onRetry={() => void loadHistory()} /> : null}

        {loading ? (
          <div className="panel history-empty" aria-busy="true" role="status">
            <p>기록을 불러오는 중입니다…</p>
          </div>
        ) : null}

        {!loading && !error && items.length === 0 ? (
          <div className="panel history-empty" role="status">
            <h2>아직 기록이 없습니다</h2>
            <p className="lede">채팅에서 질문을 보내면 여기에 쌓입니다.</p>
            <Link className="btn btn--primary" to="/chat">
              채팅으로 이동
            </Link>
          </div>
        ) : null}

        {!loading && items.length > 0 ? (
          <ul className="history-list" aria-label="대화 기록 목록">
            {items.map((item) => (
              <li key={item.id} className="panel history-card">
                <time dateTime={item.created_at}>{formatTimestamp(item.created_at)}</time>
                <div className="history-card__block">
                  <h2>질문</h2>
                  <p>{item.question}</p>
                </div>
                <div className="history-card__block">
                  <h2>응답</h2>
                  <p>{item.answer}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </main>
    </AppShell>
  );
}
