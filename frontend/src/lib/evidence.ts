export interface EvidenceListContract<T> {
  items: T[];
  total: number;
}

/** Keeps a malformed or not-yet-loaded API payload from crashing the vault UI. */
export function evidenceItems<T>(payload: EvidenceListContract<T> | undefined): T[] {
  return Array.isArray(payload?.items) ? payload.items : [];
}
