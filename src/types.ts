export type SourceKind =
  | "official-api"
  | "official-page"
  | "official-feed"
  | "official-repo"
  | "official-paper"
  | "catalog"
  | "platform"
  | "benchmark"
  | "aggregator";

export type Confidence = "candidate" | "emerging" | "verified";
export type Lifecycle = "preview" | "available" | "deprecated" | "removed" | "unknown";
export type Importance = "major" | "minor";

/** Every generative output surface the watcher is allowed to assert. */
export type Modality =
  | "text"
  | "code"
  | "image"
  | "video"
  | "audio"
  | "speech"
  | "music"
  | "3d"
  | "world"
  | "embedding"
  | "rerank"
  | "moderation";

/** How a slug is offered by its publisher. Drives "definitive" phrasing. */
export type ReleaseChannel =
  | "ga"
  | "preview"
  | "experimental"
  | "snapshot"
  | "alias"
  | "deprecated"
  | "stealth";

/** What a slug actually is, so derivatives never masquerade as new models. */
export type SlugClass = "model" | "snapshot" | "alias" | "derivative" | "quantization" | "unknown";

export interface SlugParts {
  /** Publisher-facing identifier with routing prefixes removed. */
  canonical: string;
  /** The slug exactly as the source published it. */
  raw: string;
  /** Routing namespace stripped from the raw slug (`anthropic/`, `us.`, …). */
  namespace?: string;
  /** Family token, e.g. `claude-sonnet`, `gemini`, `flux`. */
  base: string;
  /** Numeric version as written, e.g. `4.6`, `3.1`, `2`. */
  version?: string;
  /** Comparable version tuple for ordering. */
  versionParts: number[];
  /** Size/speed tier token, e.g. `pro`, `mini`, `flash`, `ultra`. */
  tier?: string;
  /** Behavioural qualifiers, e.g. `thinking`, `instruct`, `realtime`. */
  qualifiers: string[];
  /** Dated snapshot suffix in ISO form when present. */
  snapshot?: string;
  /** Quantization or format marker, e.g. `fp8`, `awq`, `gguf`. */
  quantization?: string;
  /** Total parameter count as published in the slug, e.g. `235B`. */
  size?: string;
  /** Active mixture-of-experts parameters, e.g. `22B active`. */
  activeParams?: string;
  /** Expert count for a mixture-of-experts slug, e.g. `16 experts`. */
  experts?: string;
  channel: ReleaseChannel;
  slugClass: SlugClass;
}

export interface VendorRef {
  id: string;
  name: string;
  country: string;
  homepage: string;
}

/** Result of resolving any observed name into a definitive statement. */
export interface Resolution {
  vendor?: VendorRef;
  familyId?: string;
  familyName?: string;
  modalities: Modality[];
  parts: SlugParts;
  /** True when vendor attribution came from a first-party mapping, not a guess. */
  attributionVerified: boolean;
}

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
  /** Modalities this source is authoritative for. Used by coverage reporting. */
  covers?: Modality[];
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
  vendorId?: string;
  family: string;
  familyId?: string;
  modelId: string;
  /** Canonical, routing-prefix-free slug. This is the definitive identifier. */
  slug: string;
  /** Every distinct slug spelling seen across sources for this model. */
  slugAliases: string[];
  displayName: string;
  modalities: string[];
  channel: ReleaseChannel;
  slugClass: SlugClass;
  version?: string;
  tier?: string;
  capabilities: Record<string, string | number | boolean>;
  limits: Record<string, string | number>;
  pricing?: Record<string, string | number>;
  availability: string[];
  lifecycle: Lifecycle;
  releaseDate?: string;
  evidence: Evidence[];
  confidence: Confidence;
  attributionVerified: boolean;
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

/** Per-channel subscription rules created with `/watch`. */
export interface Subscription {
  channelId: string;
  vendors: string[];
  modalities: Modality[];
  families: string[];
  minImportance: Importance;
  createdAt: string;
}

export interface WatcherState {
  models: Record<string, ModelState>;
  sources: Record<string, SourceState>;
  delivery: DeliveryState;
  digest: DigestState;
  subscriptions: Record<string, Subscription>;
}

export interface SourceRunResult {
  source: SourceAdapter;
  status: "ok" | "not-modified" | "failed" | "skipped";
  observations: ModelObservation[];
  error?: string;
  document?: SourceDocument;
  wasBaseline: boolean;
}
