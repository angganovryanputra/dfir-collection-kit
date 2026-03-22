type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

const DEFAULT_BASE_URL = "http://localhost:8000/api/v1";

const getBaseUrl = () => {
  const envUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
  return envUrl?.trim() || DEFAULT_BASE_URL;
};

const getAuthToken = () => {
  const raw = localStorage.getItem("dfir_auth");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { token?: string };
    return parsed.token ?? null;
  } catch {
    return null;
  }
};

const handleAuthFailure = (path: string) => {
  if (typeof window === "undefined") return;
  if (path.startsWith("/auth/")) return;
  localStorage.removeItem("dfir_auth");
  localStorage.removeItem("dfir_logout_reason");
  localStorage.setItem(
    "dfir_logout_reason",
    JSON.stringify({
      reason: "expired",
      timestamp: new Date().toISOString(),
    })
  );
  // Preserve current page so Login can redirect back after re-auth
  const currentPath = window.location.pathname + window.location.search;
  if (currentPath !== "/" && currentPath !== "/login") {
    localStorage.setItem("dfir_redirect_after_login", currentPath);
  }
  window.location.href = "/login";
};

const request = async <T>(path: string, method: HttpMethod, body?: unknown): Promise<T> => {
  const url = `${getBaseUrl()}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const token = getAuthToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401) {
    handleAuthFailure(path);
    throw new Error(JSON.stringify({ detail: "Unauthorized" }));
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
};

export const apiGet = <T>(path: string) => request<T>(path, "GET");
export const apiPost = <T>(path: string, body: unknown) => request<T>(path, "POST", body);
export const apiPatch = <T>(path: string, body: unknown) => request<T>(path, "PATCH", body);
export const apiPut = <T>(path: string, body: unknown) => request<T>(path, "PUT", body);
export const apiDelete = <T>(path: string) => request<T>(path, "DELETE");
