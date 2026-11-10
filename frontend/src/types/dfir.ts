export type IncidentType = 
  | "RANSOMWARE"
  | "ACCOUNT_COMPROMISE"
  | "DATA_EXFILTRATION"
  | "MALWARE"
  | "UNAUTHORIZED_ACCESS"
  | "INSIDER_THREAT";

export type IncidentStatus =
  | "PENDING"
  | "ACTIVE"
  | "COLLECTION_IN_PROGRESS"
  | "COLLECTION_COMPLETE"
  | "COLLECTION_FAILED"
  | "CLOSED";

export type EvidenceStatus = 
  | "COLLECTING"
  | "LOCKED"
  | "HASH_VERIFIED"
  | "EXPORTED";

export type CollectorStatus = "ONLINE" | "OFFLINE" | "BUSY";

export interface Incident {
  id: string;
  title?: string | null;
  description?: string | null;
  type: IncidentType;
  status: IncidentStatus;
  severity?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFORMATIONAL";
  priority?: "P0" | "P1" | "P2" | "P3";
  assignee?: string | null;
  tags?: string[];
  template_id?: string | null;
  target_endpoints: string[];
  operator: string;
  created_at: string;
  updated_at?: string;

  // Backward-compatible optional aliases
  templateId?: string | null;
  targetEndpoints?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface Evidence {
  id: string;
  incident_id: string;
  name: string;
  type: string;
  size: string;
  status: EvidenceStatus;
  hash: string;
  collected_at: string;

  // Backward-compatible optional aliases
  incidentId?: string;
  collectedAt?: string;
}

export interface ChainOfCustodyEntry {
  id: string;
  incident_id: string;
  timestamp: string;
  action: string;
  actor: string;
  target: string;
  sequence?: number;
  previous_hash?: string | null;
  entry_hash?: string;
}

export interface CollectionPhase {
  id: string;
  name: string;
  status: "pending" | "active" | "complete" | "error";
  progress?: number;
}

export interface Collector {
  id: string;
  name: string;
  status: CollectorStatus;
  last_heartbeat?: string | null;
  last_seen?: string;

  // Backward-compatible optional aliases
  lastSeen?: string;
}
