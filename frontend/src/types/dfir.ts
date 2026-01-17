export type IncidentType = 
  | "RANSOMWARE"
  | "ACCOUNT_COMPROMISE"
  | "DATA_EXFILTRATION"
  | "MALWARE"
  | "UNAUTHORIZED_ACCESS"
  | "INSIDER_THREAT";

export type IncidentStatus = 
  | "ACTIVE"
  | "COLLECTION_IN_PROGRESS"
  | "COLLECTION_COMPLETE"
  | "CLOSED";

export type EvidenceStatus = 
  | "COLLECTING"
  | "LOCKED"
  | "HASH_VERIFIED"
  | "EXPORTED";

export type CollectorStatus = "ONLINE" | "OFFLINE" | "BUSY";

export interface Incident {
  id: string;
  type: IncidentType;
  status: IncidentStatus;
  targetEndpoints: string[];
  operator: string;
  createdAt: string;
  updatedAt: string;
}

export interface Evidence {
  id: string;
  incidentId: string;
  name: string;
  type: string;
  size: string;
  status: EvidenceStatus;
  hash: string;
  collectedAt: string;
}

export interface ChainOfCustodyEntry {
  timestamp: string;
  action: string;
  actor: string;
  target: string;
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
  lastSeen: string;
}
