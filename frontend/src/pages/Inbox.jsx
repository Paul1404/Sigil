import { useState, useEffect } from "react";
import { Mail, ArrowLeft, Circle, CheckCheck } from "lucide-react";
import { api } from "../api";

export default function Inbox() {
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    api
      .getInbox()
      .then(setEmails)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const openEmail = async (id) => {
    setSelected(id);
    setDetailLoading(true);
    try {
      const data = await api.getInboxEmail(id);
      setDetail(data);
      // Mark as read in the list
      setEmails((prev) =>
        prev.map((e) => (e.id === id ? { ...e, is_read: true } : e))
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const goBack = () => {
    setSelected(null);
    setDetail(null);
  };

  const handleMarkAllRead = async () => {
    try {
      await api.markAllRead();
      setEmails((prev) => prev.map((e) => ({ ...e, is_read: true })));
    } catch (e) {
      setError(e.message);
    }
  };

  const hasUnread = emails.some((e) => !e.is_read);

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Inbox</h2>
          <p className="text-sm text-gray-500 mt-1">
            Non-report emails from your monitored mailboxes
          </p>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm">
          {error}
        </div>
      </div>
    );
  }

  // Detail view
  if (selected && detail) {
    return (
      <div className="space-y-6">
        <button
          onClick={goBack}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to inbox
        </button>

        <div className="bg-gray-900 border border-gray-800 rounded-xl">
          {/* Header */}
          <div className="p-6 border-b border-gray-800 space-y-3">
            <h2 className="text-lg font-semibold text-white">
              {detail.subject || "(no subject)"}
            </h2>
            <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
              <div>
                <span className="text-gray-500">From </span>
                <span className="text-gray-300">{detail.from_address || "-"}</span>
              </div>
              <div>
                <span className="text-gray-500">To </span>
                <span className="text-gray-300">{detail.to_address || "-"}</span>
              </div>
              <div>
                <span className="text-gray-500">Date </span>
                <span className="text-gray-300">
                  {detail.date
                    ? new Date(detail.date).toLocaleString()
                    : "-"}
                </span>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="p-6">
            {detail.body_html ? (
              <iframe
                srcDoc={detail.body_html}
                title="Email body"
                className="w-full min-h-[400px] bg-white rounded-lg border border-gray-700"
                sandbox="allow-same-origin"
              />
            ) : detail.body_text ? (
              <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
                {detail.body_text}
              </pre>
            ) : (
              <p className="text-gray-500 text-sm italic">No message body</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Inbox</h2>
          <p className="text-sm text-gray-500 mt-1">
            Non-report emails from your monitored mailboxes
          </p>
        </div>
        {hasUnread && (
          <button
            onClick={handleMarkAllRead}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white bg-gray-900 border border-gray-700 hover:border-gray-600 rounded-lg transition-colors"
          >
            <CheckCheck className="w-4 h-4" />
            Mark all read
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-400" />
        </div>
      ) : emails.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Mail className="w-12 h-12 mx-auto mb-3 opacity-30" />
          No non-report emails found. Emails that aren't DMARC reports will
          appear here after the next fetch.
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800/50">
          {emails.map((e) => (
            <button
              key={e.id}
              onClick={() => openEmail(e.id)}
              className="w-full text-left px-5 py-4 hover:bg-gray-800/30 transition-colors flex items-start gap-4"
            >
              <div className="pt-1.5 shrink-0">
                {e.is_read ? (
                  <Mail className="w-4 h-4 text-gray-600" />
                ) : (
                  <Circle className="w-2.5 h-2.5 fill-indigo-400 text-indigo-400 mt-0.5 ml-0.5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-4">
                  <span
                    className={`text-sm truncate ${e.is_read ? "text-gray-400" : "text-white font-medium"}`}
                  >
                    {e.from_address || "(unknown sender)"}
                  </span>
                  <span className="text-xs text-gray-600 whitespace-nowrap shrink-0">
                    {e.date
                      ? new Date(e.date).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : ""}
                  </span>
                </div>
                <p
                  className={`text-sm truncate mt-0.5 ${e.is_read ? "text-gray-500" : "text-gray-300"}`}
                >
                  {e.subject || "(no subject)"}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {detailLoading && (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-400" />
        </div>
      )}
    </div>
  );
}
