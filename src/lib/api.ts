import { buildAuthHeaders, clearAuthSession, isAuthError } from "@/lib/session";

export const API_BASE_URL = (() => {
  const configured = (import.meta.env.VITE_API_URL || "").trim();
  if (typeof window !== "undefined" && window.location.protocol === "https:" && configured.startsWith("http://")) {
    return "/api";
  }
  if (configured) return configured;
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    // treat both localhost and 127.0.0.1 as local dev
    if (host === "localhost" || host === "127.0.0.1") return "http://localhost:5001";
    return "/api";
  }
  return "http://localhost:5001";
})();

export const apiRequest = async <T>(path: string, init: RequestInit = {}, requiresAuth = true): Promise<T> => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };

  if (requiresAuth) {
    const authHeaders = buildAuthHeaders();
    if (!authHeaders) {
      clearAuthSession();
      window.location.href = "/admin-login";
      throw new Error("Missing auth session");
    }
    Object.assign(headers, authHeaders);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  }).catch(err => {
    // Suppress network errors from console
    throw new Error("Network error: " + err.message);
  });

  if (isAuthError(response.status)) {
    clearAuthSession();
    window.location.href = "/admin-login";
    throw new Error("Session expired");
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error((data && data.error) || `Request failed with status ${response.status}`);
  }

  return data as T;
};
