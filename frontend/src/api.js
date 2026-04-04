const BASE = "/api";

function getToken() {
  return localStorage.getItem("sigil_token");
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem("sigil_token");
    window.location.href = "/login";
    throw new Error("Session expired");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  // Auth
  login: (password) =>
    request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),

  // Dashboard
  getStats: () => request("/dashboard/stats"),
  getTimeline: () => request("/dashboard/timeline"),

  // Reports
  getReports: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.domain) qs.set("domain", params.domain);
    if (params.date_from) qs.set("date_from", params.date_from);
    if (params.date_to) qs.set("date_to", params.date_to);
    const query = qs.toString();
    return request(`/reports${query ? `?${query}` : ""}`);
  },
  getReport: (id) => request(`/reports/${id}`),

  // TLS Reports
  getTlsReports: (domain) => {
    const qs = domain ? `?domain=${encodeURIComponent(domain)}` : "";
    return request(`/tls-reports${qs}`);
  },
  getTlsReportsSummary: () => request("/tls-reports/summary"),

  // DNS
  getDnsDomains: () => request("/dns/domains"),
  checkDns: (domain, dkim_selector) =>
    request("/dns/check", {
      method: "POST",
      body: JSON.stringify({ domain, dkim_selector: dkim_selector || null }),
    }),

  // Inbox
  getInbox: (mailbox_id) => {
    const qs = mailbox_id ? `?mailbox_id=${mailbox_id}` : "";
    return request(`/inbox${qs}`);
  },
  getInboxEmail: (id) => request(`/inbox/${id}`),
  markAllRead: (mailbox_id) => {
    const qs = mailbox_id ? `?mailbox_id=${mailbox_id}` : "";
    return request(`/inbox/mark-all-read${qs}`, { method: "POST" });
  },

  // Mailboxes
  getMailboxes: () => request("/mailboxes"),
  createMailbox: (data) =>
    request("/mailboxes", { method: "POST", body: JSON.stringify(data) }),
  updateMailbox: (id, data) =>
    request(`/mailboxes/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteMailbox: (id) => request(`/mailboxes/${id}`, { method: "DELETE" }),
  fetchMailbox: (id) => request(`/mailboxes/${id}/fetch`, { method: "POST" }),
};
