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
import { emptySourceState, isLegacySnapshot } from "./state.ts";
import { canonicalModalities, compareVersions, isDerivative, parseSlug, resolve } from "./catalog/index.ts";
import { canonicalToken, modelKey, sha256, stableJson } from "./util.ts";

const OFFICIAL = new Set(["official-api", "official-page", "official-feed", "official-repo", "official-paper"]);
const MAJOR_FIELDS = new Set(["confidence", "modalities", "capabilities", "limits", "pricing", "lifecycle", "releaseDate", "channel", "version", "tier"]);

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

const KIND_RANK = {
  "official-api": 0,
  "official-page": 1,
  "official-feed": 2,
  "official-repo": 3,
  "official-paper": 4,
  catalog: 5,
  platform: 6,
  benchmark: 7,
  aggregator: 8,
} as const;

function sourceRank(observation: StoredObservation): number {
  return KIND_RANK[observation.sourceKind];
}

/**
 * A name read out of prose keeps the spacing of the sentence it came from:
 * "Gemini 2.0" is a phrase, `gemini-2.0-flash-001` is an identifier. Every
 * adapter that reads prose routes its match through here unchanged, so the
 * whitespace is a reliable marker of where the name came from.
 */
function isProseName(modelId: string): boolean {
  return /\s/.test(modelId);
}

/** True when no source has ever published this record as an identifier. */
function isProseOnly(observations: StoredObservation[]): boolean {
  return observations.length > 0 && observations.every((item) => isProseName(item.value.modelId));
}

function confidenceOf(observations: StoredObservation[]): Confidence {
  // Prose proves that a publisher wrote a name down, not that a model ships
  // under it. Until some source publishes a machine-readable identifier there
  // is nothing specific to confirm, so the sighting stays a candidate. It
  // merges into the real record as soon as an identifier appears, because both
  // spellings share one model key.
  if (isProseOnly(observations)) return "candidate";
  if (observations.some((item) => OFFICIAL.has(item.sourceKind))) return "verified";
  if (observations.some((item) => item.sourceKind === "catalog" || item.sourceKind === "platform")) return "emerging";
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

  // Attribution is recomputed from the highest-ranked evidence every run, so a
  // model that starts unattributed becomes definitive as soon as a first-party
  // source names it.
  const firstParty = ordered.find((item) => OFFICIAL.has(item.sourceKind));
  // Prefer a machine-readable identifier over a marketing name read from prose:
  // `gemini-3.6-flash` is the slug, "Gemini 3.6 Flash" is only its title.
  const identifier = ordered.find((item) => !/\s/.test(item.value.modelId)) ?? primary;
  const titled = ordered.find((item) => item.value.displayName !== item.value.modelId) ?? primary;
  const resolution = resolve({
    slug: identifier.value.modelId,
    displayName: titled.value.displayName,
    ...(firstParty?.sourceOwner ? { assertedVendorId: firstParty.sourceOwner } : {}),
  });

  const modalities = unique(
    observations.flatMap((item) => canonicalModalities(item.value.modalities)),
  ).sort();
  const availability = unique(observations.flatMap((item) => item.value.availability)).sort();
  const capabilities = (mergeRecord(ordered, "capabilities") ?? {}) as Record<string, string | number | boolean>;
  const limits = (mergeRecord(ordered, "limits") ?? {}) as Record<string, string | number>;
  const pricing = mergeRecord(ordered, "pricing") as Record<string, string | number> | undefined;
  const slugAliases = unique(observations.map((item) => item.value.modelId)).sort();

  const core = {
    owner: resolution.vendor?.name ?? primary.value.owner,
    vendorId: resolution.vendor?.id,
    family: resolution.familyName ?? primary.value.family,
    familyId: resolution.familyId,
    modelId: identifier.value.modelId,
    slug: resolution.parts.canonical,
    slugAliases,
    displayName: titled.value.displayName,
    modalities: modalities.length ? modalities : resolution.modalities,
    channel: resolution.parts.channel,
    slugClass: resolution.parts.slugClass,
    version: resolution.parts.version,
    tier: resolution.parts.tier,
    capabilities,
    limits,
    pricing,
    availability,
    lifecycle: primary.value.lifecycle,
    releaseDate: ordered.find((item) => item.value.releaseDate)?.value.releaseDate,
    confidence,
    attributionVerified: resolution.attributionVerified,
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
  const ignored = new Set(["evidence", "fingerprint", "firstSeen", "lastChanged", "key", "slugAliases"]);
  return Object.keys(after)
    .filter((key) => !ignored.has(key))
    .filter((key) => stableJson(before[key as keyof ModelSnapshot]) !== stableJson(after[key as keyof ModelSnapshot]));
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
  // A dated snapshot or rolling alias of a model already tracked is not a new
  // model, and a repository-only sighting of a variant is not a release.
  const pointer = after.slugClass === "alias" || after.slugClass === "snapshot";
  const repositoryOnly = after.evidence.every((item) => item.sourceKind === "official-repo");
  const structural = type === "added" || type === "verified" || type === "reintroduced";
  // A candidate names nothing a reader can act on, so however newsworthy it
  // looks it belongs in the digest rather than in an immediate alert.
  const unidentified = after.confidence === "candidate";
  const importance =
    !unidentified &&
    ((structural && !pointer && !(type === "added" && repositoryOnly && !after.version)) ||
      fields.some((field) => MAJOR_FIELDS.has(field)))
      ? "major"
      : "minor";
  return { id: eventId(type, after, fields), type, importance, before, after, changedFields: fields, detectedAt: now };
}

/**
 * Highest version already tracked per family, taken before this run's results
 * are applied. A newly seen name that sits *below* its family's head is a
 * back-reference in prose ("...unlike Gemini 2..."), not a release.
 */
function familyHeads(before: Map<string, ModelSnapshot | undefined>): Map<string, number[]> {
  const heads = new Map<string, number[]>();
  for (const snapshot of before.values()) {
    if (!snapshot?.familyId || !snapshot.version) continue;
    const parts = parseSlug(snapshot.slug).versionParts;
    const current = heads.get(snapshot.familyId);
    if (!current || compareVersions({ versionParts: parts } as never, { versionParts: current } as never) < 0) {
      heads.set(snapshot.familyId, parts);
    }
  }
  return heads;
}

function isBackReference(snapshot: ModelSnapshot, heads: Map<string, number[]>): boolean {
  if (!snapshot.familyId || !snapshot.version) return false;
  const head = heads.get(snapshot.familyId);
  if (!head?.length) return false;
  const parts = parseSlug(snapshot.slug).versionParts;
  if (!parts.length) return false;
  return compareVersions({ versionParts: parts } as never, { versionParts: head } as never) > 0;
}

/**
 * Rebuilds any snapshot written under an older schema from the very
 * observations that produced it. Comparing this run against an un-migrated
 * record would report slug, channel, and attribution as fresh changes on
 * every model at once — thousands of alerts about nothing but the rebuild.
 */
function migrateLegacySnapshots(state: WatcherState): number {
  let migrated = 0;
  for (const [key, model] of Object.entries(state.models)) {
    const legacy = model.snapshot;
    if (!legacy || !isLegacySnapshot(legacy)) continue;
    const rebuilt = snapshotFrom(key, model, legacy.lastChanged);
    if (!rebuilt) continue;
    model.snapshot = rebuilt;
    migrated += 1;
  }
  return migrated;
}

export function applySourceResults(state: WatcherState, runs: SourceRunResult[], now = new Date().toISOString()): ModelEvent[] {
  const migrated = migrateLegacySnapshots(state);
  if (migrated) console.log(`[state] rebuilt ${migrated} snapshot(s) stored under an older schema`);
  const before = new Map(Object.entries(state.models).map(([key, value]) => [key, value.snapshot]));
  const heads = familyHeads(before);
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
      const parts = parseSlug(observation.modelId);
      if (isDerivative(parts)) continue;
      const key = modelKey(observation.family, parts.canonical);
      currentKeys.add(key);
      const model = state.models[key] ?? { observations: {} };
      state.models[key] = model;
      model.observations[run.source.id] = {
        sourceId: run.source.id,
        sourceKind: run.source.kind,
        ...(run.source.owner ? { sourceOwner: run.source.owner } : {}),
        observedAt: now,
        value: observation,
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
    const confidence = next.confidence;
    if (confidence === "candidate") {
      // A launch post can land days before the identifier does. The first time
      // a publisher announces a name we cannot yet resolve to a slug, it goes
      // out in the daily digest — never as an immediate alert, because there
      // is nothing specific to act on. Later prose repeats nothing new, and
      // the real announcement follows once an identifier appears.
      if (!previous && !seededKeys.has(key) && isProseOnly(Object.values(model.observations))) {
        events.push(makeEvent("added", next, previous, ["announcement"], now));
      }
      continue;
    }

    // Every structural event claims "here is a specific model you have not
    // been told about". An older version of an already-tracked family is a
    // first sighting of a name, not a launch, so it is recorded and digested
    // rather than announced — and that holds however the sighting arrived,
    // not only when it arrives as an addition.
    const structural = (event: ModelEvent): void => {
      if (isBackReference(next, heads)) event.importance = "minor";
      model.lastAnnouncedConfidence = confidence;
      events.push(event);
    };

    if (!previous || previous.confidence === "candidate") {
      if (seededKeys.has(key)) continue;
      // A key the reader has already been shown is not a new model, even when
      // its evidence briefly thinned out to a candidate and recovered. Report
      // what actually changed instead of announcing it a second time.
      if (previous && model.lastAnnouncedConfidence) {
        const fields = changedFields(previous, next);
        if (fields.length) events.push(makeEvent("updated", next, previous, fields, now));
        continue;
      }
      structural(makeEvent("added", next, previous, ["model"], now));
      continue;
    }
    if (previous.lifecycle === "removed") {
      structural(makeEvent("reintroduced", next, previous, ["lifecycle"], now));
      continue;
    }
    if (previous.confidence === "emerging" && next.confidence === "verified") {
      structural(makeEvent("verified", next, previous, ["confidence"], now));
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
    family: canonicalToken(family) || family,
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
