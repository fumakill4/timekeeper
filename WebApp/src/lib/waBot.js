import { auth } from "./firebase";

const WA_BOT_API_URL = String(import.meta.env.VITE_TIMEKEEPER_WA_API_URL || "").replace(/\/$/, "");

export const isWaBotConfigured = Boolean(WA_BOT_API_URL);

async function request(path, options = {}) {
  const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null;
  const response = await fetch(`${WA_BOT_API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || payload.lastError || `WA bot request failed (${response.status})`);
  return payload;
}

async function requestBlob(path, options = {}) {
  const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null;
  const response = await fetch(`${WA_BOT_API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `WA bot request failed (${response.status})`);
  }
  return response.blob();
}

export const waBotApi = {
  getStatus: () => request("/api/wa/status"),
  connect: () => request("/api/wa/connect", { method: "POST" }),
  disconnect: () => request("/api/wa/disconnect", { method: "POST" }),
  exportPeriod: (label) => requestBlob("/api/export/period", { method: "POST", body: JSON.stringify({ label }) }),
};
