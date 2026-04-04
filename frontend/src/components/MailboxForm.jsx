import { useState } from "react";

const defaultForm = {
  name: "",
  imap_host: "",
  imap_port: 993,
  username: "",
  password: "",
  folder: "INBOX",
};

export default function MailboxForm({ initial, onSubmit, onCancel }) {
  const [form, setForm] = useState(initial || defaultForm);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({ ...form, imap_port: parseInt(form.imap_port, 10) });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Name</label>
          <input
            type="text"
            value={form.name}
            onChange={set("name")}
            required
            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
            placeholder="My Mailbox"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">IMAP Host</label>
          <input
            type="text"
            value={form.imap_host}
            onChange={set("imap_host")}
            required
            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
            placeholder="imap.example.com"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Port</label>
          <input
            type="number"
            value={form.imap_port}
            onChange={set("imap_port")}
            required
            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Username</label>
          <input
            type="text"
            value={form.username}
            onChange={set("username")}
            required
            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
            placeholder="user@example.com"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Password</label>
          <input
            type="password"
            value={form.password}
            onChange={set("password")}
            required={!initial}
            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
            placeholder={initial ? "(unchanged)" : ""}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Folder</label>
          <input
            type="text"
            value={form.folder}
            onChange={set("folder")}
            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
          />
        </div>
      </div>
      <div className="flex gap-3 justify-end">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {initial ? "Update" : "Add Mailbox"}
        </button>
      </div>
    </form>
  );
}
