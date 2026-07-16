export type SourceKind =
  | "official-api"
  | "official-page"
  | "official-feed"
  | "official-repo"
  | "official-paper"
  | "benchmark"
  | "aggregator";

export type Confidence = "candidate" | "emerging" | "verified";
export type Lifecycle = "preview" | "available" | "deprecated" | "removed" | "unknown";
export type Importance = "major" | "minor";

export interface SourceDocument {
  url: string;
  status: 200 | 304;
  body: string;
  contentType?: string;
  etag?: string;
  lastModified?: string;
  fetchedAt: string;
}

export interface ModelObservation {
  owner?: string;
  family: string;
  modelId: string;
  displayName: string;
  modalities: string[];
  capabilities: Record<string, string | number | boolean>;
  limits: Record<string, string | number>;
  pricing?: Record<string, string | number>;
  availability: string[];
  lifecycle: Lifecycle;
  releaseDate?: string;
  sourceUrl: string;
}

export interface SourceAdapter {
  id: string;
  owner?: string;
  kind: SourceKind;
  intervalMinutes: number;
  url: string;
  tracksRemovals: boolean;
  enabled(): boolean;
  fetch(cache: Pick<SourceState, "etag" | "lastModified">): Promise<SourceDocument>;
  parse(document: SourceDocument): ModelObservation[];
}

export interface Evidence {
  sourceId: string;
  sourceKind: SourceKind;
  url: string;
  observedAt: string;
}

export interface ModelSnapshot {
  key: string;
  owner?: string;
  family: string;
  modelId: string;
  displayName: string;
  modalities: string[];
  capabilities: Record<string, string | number | boolean>;
  limits: Record<string, string | number>;
  pricing?: Record<string, string | number>;
  availability: string[];
  lifecycle: Lifecycle;
  releaseDate?: string;
  evidence: Evidence[];
  confidence: Confidence;
  fingerprint: string;
  firstSeen: string;
  lastChanged: string;
}

export interface StoredObservation {
  sourceId: string;
  sourceKind: SourceKind;
  sourceOwner?: string;
  observedAt: string;
  value: ModelObservation;
}

export interface ModelState {
  observations: Record<string, StoredObservation>;
  snapshot?: ModelSnapshot;
  lastAnnouncedConfidence?: Exclude<Confidence, "candidate">;
  removedAt?: string;
}

export interface SourceState {
  lastChecked?: string;
  lastSuccess?: string;
  failureCount: number;
  etag?: string;
  lastModified?: string;
  fingerprint?: string;
  modelKeys: string[];
  missingCounts: Record<string, number>;
  baselineComplete: boolean;
}

export interface ModelEvent {
  id: string;
  type: "added" | "updated" | "removed" | "reintroduced" | "verified";
  importance: Importance;
  before?: ModelSnapshot;
  after: ModelSnapshot;
  changedFields: string[];
  detectedAt: string;
}

export interface DeliveryState {
  sent: Record<string, string>;
  pendingMajor: ModelEvent[];
}

export interface DigestState {
  pending: ModelEvent[];
  lastPostedLocalDate?: string;
}

export interface WatcherState {
  models: Record<string, ModelState>;
  sources: Record<string, SourceState>;
  delivery: DeliveryState;
  digest: DigestState;
}

export interface SourceRunResult {
  source: SourceAdapter;
  status: "ok" | "not-modified" | "failed" | "skipped";
  observations: ModelObservation[];
  error?: string;
  document?: SourceDocument;
  wasBaseline: boolean;
}
