import { logout } from "./auth";

type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

const DEFAULT_BASE_URL = "/api/v1";

const METHOD_TIMEOUT_MS: Record<HttpMethod, number> = {
  GET: 30_000,
  POST: 120_000,
  PATCH: 30_000,
  PUT: 60_000,
  DELETE: 30_000,
};

const NO_TIMEOUT_PATHS = ["/agents/upload", "/evidence/exports", "/siem-export"];

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

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const request = async <T>(
  path: string,
  method: HttpMethod,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> => {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}${path}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const skipTimeout = NO_TIMEOUT_PATHS.some((p) => path.includes(p));
  const timeoutMs = skipTimeout ? 0 : METHOD_TIMEOUT_MS[method];

  let controller: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let combinedSignal: AbortSignal | undefined = signal;

  if (timeoutMs > 0) {
    controller = new AbortController();
    timer = setTimeout(
      () => controller!.abort(new DOMException("Request timed out", "TimeoutError")),
      timeoutMs,
    );
    if (signal) {
      signal.addEventListener("abort", () => controller!.abort(signal.reason));
    }
    combinedSignal = controller.signal;
  }

  const RETRYABLE = new Set([429, 503]);
  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: combinedSignal,
      });

      if (timer) { clearTimeout(timer); timer = null; }

      if (response.status === 401) {
        logout("expired");
        throw new Error(JSON.stringify({ detail: "Session expired", status: 401 }));
      }

      if (response.status === 403) {
        throw new Error(JSON.stringify({ detail: "Access denied", status: 403 }));
      }

      if (RETRYABLE.has(response.status) && attempt < MAX_RETRIES - 1) {
        const retryAfter = response.headers.get("Retry-After");
        const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : (attempt + 1) * 2_000;
        await sleep(Math.min(delay, 10_000));
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        let errorBody;
        try {
          errorBody = JSON.parse(errorText);
        } catch {
          errorBody = { detail: errorText || `Request failed: ${response.status}` };
        }
        throw new Error(JSON.stringify({ ...errorBody, status: response.status }));
      }

      if (response.status === 204) return undefined as T;

      return (await response.json()) as T;
    } catch (err) {
      if (timer) { clearTimeout(timer); timer = null; }
      if (err instanceof DOMException && err.name === "TimeoutError") {
        throw new Error(JSON.stringify({ 
          detail: `Request timed out after ${timeoutMs / 1000}s`, 
          status: 408 
        }));
      }
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      
      if (attempt < MAX_RETRIES - 1) {
        await sleep((attempt + 1) * 1_000);
        continue;
      }
      throw err;
    }
  }
  throw new Error(JSON.stringify({ detail: "Request failed after retries", status: 500 }));
};

export const apiGet = <T>(path: string, signal?: AbortSignal) =>
  request<T>(path, "GET", undefined, signal);
export const apiPost = <T>(path: string, body: unknown, signal?: AbortSignal) =>
  request<T>(path, "POST", body, signal);
export const apiPatch = <T>(path: string, body: unknown, signal?: AbortSignal) =>
  request<T>(path, "PATCH", body, signal);
export const apiPut = <T>(path: string, body: unknown, signal?: AbortSignal) =>
  request<T>(path, "PUT", body, signal);
export const apiDelete = <T>(path: string, signal?: AbortSignal) =>
  request<T>(path, "DELETE", undefined, signal);
