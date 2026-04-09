const API_BASE_STORAGE_KEY = "fit_ai_api_base";

export function getApiBaseUrl() {
  return window.localStorage.getItem(API_BASE_STORAGE_KEY) || "";
}

export function setApiBaseUrl(url) {
  const value = String(url || "").trim();
  if (value) {
    window.localStorage.setItem(API_BASE_STORAGE_KEY, value);
  } else {
    window.localStorage.removeItem(API_BASE_STORAGE_KEY);
  }
}

function buildUrl(path) {
  const base = getApiBaseUrl().trim();
  if (!base) return path;
  return `${base.replace(/\/$/, "")}${path}`;
}

async function request(path, options = {}) {
  const response = await fetch(buildUrl(path), {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `请求失败：HTTP ${response.status}`);
  }

  return response.json();
}

export const api = {
  getBootstrap: () => request("/api/bootstrap"),
  saveProfile: (payload) => request("/api/profile", { method: "POST", body: JSON.stringify(payload) }),
  saveReadiness: (payload) => request("/api/readiness", { method: "POST", body: JSON.stringify(payload) }),
  addRecord: (payload) => request("/api/records", { method: "POST", body: JSON.stringify(payload) }),
  runWorkflow: (trigger) => request("/api/ai/workflow", { method: "POST", body: JSON.stringify({ trigger }) }),
  regeneratePlan: () => request("/api/ai/plan", { method: "POST" }),
  getDailyBriefing: () => request("/api/ai/daily-briefing", { method: "POST" }),
  getDietAdvice: () => request("/api/ai/diet", { method: "POST" }),
  chatWithCoach: (message) => request("/api/ai/chat", { method: "POST", body: JSON.stringify({ message }) }),
  applyWeekPlan: (payload) => request("/api/plan/apply-week", { method: "POST", body: JSON.stringify(payload) }),
  applyDayPlan: (payload) => request("/api/plan/apply-day", { method: "POST", body: JSON.stringify(payload) }),
  savePlan: (payload) => request("/api/plan/save", { method: "POST", body: JSON.stringify(payload) }),
  addCustomExercise: (payload) => request("/api/exercises/custom", { method: "POST", body: JSON.stringify(payload) }),
  getMemory: () => request("/api/memory")
};
