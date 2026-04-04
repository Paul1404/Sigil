import { useState, useEffect } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Mail,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { api } from "../api";
import MailboxForm from "../components/MailboxForm";

export default function Settings() {
  const [mailboxes, setMailboxes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [fetchStatus, setFetchStatus] = useState({});

  const loadMailboxes = () => {
    setLoading(true);
    api
      .getMailboxes()
      .then(setMailboxes)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadMailboxes();
  }, []);

  const handleAdd = async (data) => {
    try {
      await api.createMailbox(data);
      setShowAdd(false);
      loadMailboxes();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleUpdate = async (data) => {
    try {
      await api.updateMailbox(editing.id, data);
      setEditing(null);
      loadMailboxes();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this mailbox and all its reports?")) return;
    try {
      await api.deleteMailbox(id);
      loadMailboxes();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleFetch = async (id) => {
    setFetchStatus((s) => ({ ...s, [id]: "loading" }));
    try {
      const result = await api.fetchMailbox(id);
      setFetchStatus((s) => ({
        ...s,
        [id]: result.status === "success" ? "done" : "error",
      }));
      if (result.status === "error") {
        setError(result.message);
      }
      loadMailboxes();
    } catch (e) {
      setFetchStatus((s) => ({ ...s, [id]: "error" }));
      setError(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Settings</h2>
          <p className="text-sm text-gray-500 mt-1">
            Manage IMAP mailbox connections
          </p>
        </div>
        <button
          onClick={() => {
            setShowAdd(!showAdd);
            setEditing(null);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Mailbox
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-300"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            New Mailbox
          </h3>
          <MailboxForm
            onSubmit={handleAdd}
            onCancel={() => setShowAdd(false)}
          />
        </div>
      )}

      {/* Edit form */}
      {editing && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            Edit: {editing.name}
          </h3>
          <MailboxForm
            initial={{
              name: editing.name,
              imap_host: editing.imap_host,
              imap_port: editing.imap_port,
              username: editing.username,
              password: "",
              folder: editing.folder,
            }}
            onSubmit={handleUpdate}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-400" />
        </div>
      ) : mailboxes.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Mail className="w-12 h-12 mx-auto mb-3 text-gray-700" />
          <p>No mailboxes configured yet.</p>
          <p className="text-sm mt-1">
            Add one to start fetching DMARC reports.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {mailboxes.map((mb) => (
            <div
              key={mb.id}
              className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex items-center justify-between"
            >
              <div className="flex items-center gap-4">
                <div
                  className={`w-2.5 h-2.5 rounded-full ${mb.is_active ? "bg-green-400" : "bg-gray-600"}`}
                />
                <div>
                  <h4 className="text-white font-medium">{mb.name}</h4>
                  <p className="text-xs text-gray-500">
                    {mb.username}@{mb.imap_host}:{mb.imap_port} / {mb.folder}
                  </p>
                  {mb.last_fetched_at && (
                    <p className="text-xs text-gray-600 mt-0.5">
                      Last fetched:{" "}
                      {new Date(mb.last_fetched_at).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleFetch(mb.id)}
                  disabled={fetchStatus[mb.id] === "loading"}
                  className="p-2 text-gray-400 hover:text-indigo-400 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
                  title="Fetch now"
                >
                  {fetchStatus[mb.id] === "loading" ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : fetchStatus[mb.id] === "done" ? (
                    <CheckCircle className="w-4 h-4 text-green-400" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                </button>
                <button
                  onClick={() => {
                    setEditing(mb);
                    setShowAdd(false);
                  }}
                  className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                  title="Edit"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(mb.id)}
                  className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
        <h4 className="text-sm font-medium text-gray-300 mb-2">
          Auto-Fetch Schedule
        </h4>
        <p className="text-xs text-gray-500">
          Active mailboxes are automatically checked every 6 hours for new DMARC
          reports. Use the refresh button to trigger an immediate fetch.
        </p>
      </div>
    </div>
  );
}
