export type StoredAuth = {
  username: string;
  role: string;
  expiresAt: string;
};

const AUTH_STORAGE_KEY = "dfir_session";

export function getStoredAuth(): StoredAuth | null {
  try {
    const raw = sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredAuth>;
    if (!value.username || !value.role || !value.expiresAt) return null;
    return { username: value.username, role: value.role, expiresAt: value.expiresAt };
  } catch {
    return null;
  }
}

export function setStoredAuth(session: StoredAuth): void {
  // A previous release stored a bearer token in localStorage.  Delete it as
  // soon as a new cookie-based session is established.
  localStorage.removeItem("dfir_auth");
  sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredAuth(): void {
  localStorage.removeItem("dfir_auth");
  sessionStorage.removeItem("dfir_auth");
  sessionStorage.removeItem(AUTH_STORAGE_KEY);
}

export function isSessionValid(): boolean {
  const auth = getStoredAuth();
  return Boolean(auth && Number.isFinite(Date.parse(auth.expiresAt)) && Date.parse(auth.expiresAt) > Date.now());
}

export function getStoredRole(): string | null {
  return getStoredAuth()?.role ?? null;
}

export function isViewerRole(role: string | null | undefined): boolean {
  return role === "viewer";
}

/** Shared logout operation used by the API client and navigation components. */
export function logout(reason?: "expired" | "manual") {
  clearStoredAuth();

  // Avoid redirect loops when a failed login request itself returns 401.
  if (window.location.pathname !== "/login") {
    const suffix = reason ? `?reason=${encodeURIComponent(reason)}` : "";
    window.location.assign(`/login${suffix}`);
  }
}
