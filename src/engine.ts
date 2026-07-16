import type {
  Confidence,
  ModelEvent,
  ModelObservation,
  ModelSnapshot,
  ModelState,
  SourceAdapter,
  SourceRunResult,
  StoredObservation,
  WatcherState,
} from "./types.ts";
import { emptySourceState } from "./state.ts";
import { canonicalToken, modelKey, sha256, stableJson } from "./util.ts";

const OFFICIAL = new Set(["official-api", "official-page", "official-feed", "official-repo", "official-paper"]);
const MAJOR_FIELDS = new Set(["confidence", "modalities", "capabilities", "limits", "pricing", "lifecycle", "releaseDate"]);

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function sourceRank(observation: StoredObservation): number {
  const rank = {
    "official-api": 0,
    "official-page": 1,
    "official-feed": 2,
    "official-repo": 3,
    "official-paper": 4,
    benchmark: 5,
    aggregator: 6,
  } as const;
  return rank[observation.sourceKind];
}

function confidenceOf(observations: StoredObservation[]): Confidence {
  if (observations.some((item) => OFFICIAL.has(item.sourceKind))) return "verified";
  if (observations.some((item) => item.sourceKind === "benchmark")) return "emerging";
  if (new Set(observations.map((item) => item.sourceId)).size >= 2) return "emerging";
  return "candidate";
}

function mergeRecord(
  observations: StoredObservation[],
  field: "capabilities" | "limits" | "pricing",
): Record<string, string | number | boolean> | undefined {
  const result: Record<string, string | number | boolean> = {};
  for (const observation of [...observations].sort((a, b) => sourceRank(b) - sourceRank(a))) {
    Object.assign(result, observation.value[field] ?? {});
  }
  return Object.keys(result).length ? result : undefined;
}

function snapshotFrom(key: string, state: ModelState, now: string): ModelSnapshot | undefined {
  const observations = Object.values(state.observations);
  if (observations.length === 0) return undefined;
  const ordered = [...observations].sort((a, b) => sourceRank(a) - sourceRank(b));
  const primary = ordered[0]!;
  const confidence = confidenceOf(observations);
  const modalities = unique(observations.flatMap((item) => item.value.modalities.map(canonicalToken))).sort();
  const availability = unique(observations.flatMap((item) => item.value.availability)).sort();
  const owner = ordered.find((item) => OFFICIAL.has(item.sourceKind))?.sourceOwner;
  const capabilities = mergeRecord(ordered, "capabilities") ?? {};
  const limits = (mergeRecord(ordered, "limits") ?? {}) as Record<string, string | number>;
  const pricing = mergeRecord(ordered, "pricing") as Record<string, string | number> | undefined;
  const core = {
    owner,
    family: primary.value.family,
    modelId: primary.value.modelId,
    displayName: primary.value.displayName,
    modalities,
    capabilities,
    limits,
    pricing,
    availability,
    lifecycle: primary.value.lifecycle,
    releaseDate: ordered.find((item) => item.value.releaseDate)?.value.releaseDate,
    confidence,
  };
  const fingerprint = sha256(stableJson(core));
  return {
    key,
    ...core,
    evidence: ordered.map((item) => ({
      sourceId: item.sourceId,
      sourceKind: item.sourceKind,
      url: item.value.sourceUrl,
      observedAt: item.observedAt,
    })),
    fingerprint,
    firstSeen: state.snapshot?.firstSeen ?? now,
    lastChanged: state.snapshot?.fingerprint === fingerprint ? state.snapshot.lastChanged : now,
  };
}

function changedFields(before: ModelSnapshot, after: ModelSnapshot): string[] {
  const ignored = new Set(["evidence", "fingerprint", "firstSeen", "lastChanged", "key"]);
  return Object.keys(after)
    .filter((key) => !ignored.has(key))
    .filter(
      (key) =>
        stableJson(before[key as keyof ModelSnapshot]) !== stableJson(after[key as keyof ModelSnapshot]),
    );
}

function eventId(type: ModelEvent["type"], after: ModelSnapshot, fields: string[]): string {
  return sha256(`${type}:${after.key}:${after.fingerprint}:${fields.sort().join(",")}`).slice(0, 24);
}

function makeEvent(
  type: ModelEvent["type"],
  after: ModelSnapshot,
  before: ModelSnapshot | undefined,
  fields: string[],
  now: string,
): ModelEvent {
  const repositoryVariant = type === "added"
    && after.evidence.every((item) => item.sourceKind === "official-repo")
    && /(?:gguf|awq|gptq|fp8|int4|bnb|mlx|quant|adapter|lora|4bit|8bit)/i.test(after.modelId);
  const importance = !repositoryVariant && (type === "added" || type === "verified" || type === "reintroduced" || fields.some((f) => MAJOR_FIELDS.has(f)))
    ? "major"
    : "minor";
  return { id: eventId(type, after, fields), type, importance, before, after, changedFields: fields, detectedAt: now };
}

export function applySourceResults(state: WatcherState, runs: SourceRunResult[], now = new Date().toISOString()): ModelEvent[] {
  const before = new Map(Object.entries(state.models).map(([key, value]) => [key, value.snapshot]));
  const seededKeys = new Set<string>();

  for (const run of runs) {
    const sourceState = state.sources[run.source.id] ?? emptySourceState();
    state.sources[run.source.id] = sourceState;
    if (run.status === "skipped") continue;
    sourceState.lastChecked = now;
    if (run.status === "failed") {
      sourceState.failureCount += 1;
      continue;
    }
    sourceState.failureCount = 0;
    sourceState.lastSuccess = now;
    if (run.document?.etag) sourceState.etag = run.document.etag;
    if (run.document?.lastModified) sourceState.lastModified = run.document.lastModified;
    if (run.document?.status === 200) sourceState.fingerprint = sha256(run.document.body);
    if (run.status === "not-modified") continue;

    const currentKeys = new Set<string>();
    for (const observation of run.observations) {
      const key = modelKey(observation.family, observation.modelId);
      currentKeys.add(key);
      const model = state.models[key] ?? { observations: {} };
      state.models[key] = model;
      model.observations[run.source.id] = {
        sourceId: run.source.id,
        sourceKind: run.source.kind,
        sourceOwner: run.source.owner,
        observedAt: now,
        value: { ...observation, owner: run.source.owner ?? observation.owner },
      };
      sourceState.missingCounts[key] = 0;
      if (run.wasBaseline && !before.has(key)) seededKeys.add(key);
    }

    const trackedKeys = new Set(currentKeys);
    for (const key of run.source.tracksRemovals ? sourceState.modelKeys : []) {
      if (currentKeys.has(key)) continue;
      const count = (sourceState.missingCounts[key] ?? 0) + 1;
      sourceState.missingCounts[key] = count;
      if (count >= 3) delete state.models[key]?.observations[run.source.id];
      else trackedKeys.add(key);
    }
    sourceState.modelKeys = [...trackedKeys].sort();
    sourceState.baselineComplete = true;
  }

  const events: ModelEvent[] = [];
  for (const [key, model] of Object.entries(state.models)) {
    const previous = before.get(key);
    const next = snapshotFrom(key, model, now);
    if (!next) {
      if (previous && previous.lifecycle !== "removed") {
        const removed = { ...previous, lifecycle: "removed" as const, lastChanged: now };
        removed.fingerprint = sha256(stableJson({ ...removed, evidence: undefined, fingerprint: undefined }));
        model.snapshot = removed;
        model.removedAt = now;
        events.push(makeEvent("removed", removed, previous, ["lifecycle"], now));
      }
      continue;
    }
    model.snapshot = next;
    if (next.confidence === "candidate") continue;
    if (!previous || previous.confidence === "candidate") {
      if (!seededKeys.has(key)) events.push(makeEvent("added", next, previous, ["model"], now));
      continue;
    }
    if (previous.lifecycle === "removed") {
      events.push(makeEvent("reintroduced", next, previous, ["lifecycle"], now));
      continue;
    }
    if (previous.confidence === "emerging" && next.confidence === "verified") {
      events.push(makeEvent("verified", next, previous, ["confidence"], now));
      continue;
    }
    if (previous.fingerprint !== next.fingerprint) {
      const fields = changedFields(previous, next);
      if (fields.length) events.push(makeEvent("updated", next, previous, fields, now));
    }
  }
  return events;
}

export function sourceRunFailure(source: SourceAdapter, error: unknown, wasBaseline: boolean): SourceRunResult {
  return {
    source,
    status: "failed",
    observations: [],
    error: error instanceof Error ? error.message : String(error),
    wasBaseline,
  };
}

export function observation(
  sourceUrl: string,
  family: string,
  modelId: string,
  options: Partial<ModelObservation> = {},
): ModelObservation {
  return {
    family,
    modelId,
    displayName: options.displayName ?? modelId,
    modalities: options.modalities ?? [],
    capabilities: options.capabilities ?? {},
    limits: options.limits ?? {},
    availability: options.availability ?? [],
    lifecycle: options.lifecycle ?? "unknown",
    sourceUrl,
    ...options,
  };
}
