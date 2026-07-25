import type { Modality, ModelSnapshot, WatcherState } from "./types.ts";
import { FAMILY_BY_ID, VENDORS, VENDOR_BY_ID, compareVersions, parseSlug, vendorFromToken } from "./catalog/index.ts";
import { canonicalToken } from "./util.ts";
import { isLegacySnapshot } from "./state.ts";

export interface Filter {
  vendorId?: string;
  familyId?: string;
  modality?: Modality;
  /** Include dated snapshots and rolling aliases alongside base models. */
  includePointers?: boolean;
  /** Only models first seen within this many hours. */
  sinceHours?: number;
  /** Only models whose attribution is first-party verified. */
  verifiedOnly?: boolean;
  query?: string;
}

/**
 * Every tracked model the bot is allowed to talk about. Records still stored
 * under an older schema are held back: the watcher rebuilds them on its next
 * run, and until then they cannot be rendered or filtered truthfully.
 */
export function snapshots(state: WatcherState): ModelSnapshot[] {
  return Object.values(state.models)
    .map((model) => model.snapshot)
    .filter(
      (snapshot): snapshot is ModelSnapshot =>
        Boolean(snapshot) && snapshot!.lifecycle !== "removed" && !isLegacySnapshot(snapshot),
    );
}

function matchesQuery(snapshot: ModelSnapshot, query: string): boolean {
  const needle = query.toLowerCase();
  return (
    snapshot.slug.toLowerCase().includes(needle) ||
    snapshot.displayName.toLowerCase().includes(needle) ||
    snapshot.slugAliases.some((alias) => alias.toLowerCase().includes(needle)) ||
    (snapshot.owner ?? "").toLowerCase().includes(needle) ||
    snapshot.family.toLowerCase().includes(needle)
  );
}

export function select(state: WatcherState, filter: Filter = {}): ModelSnapshot[] {
  const cutoff = filter.sinceHours ? Date.now() - filter.sinceHours * 3_600_000 : undefined;
  return snapshots(state).filter((snapshot) => {
    if (filter.vendorId && snapshot.vendorId !== filter.vendorId) return false;
    if (filter.familyId && snapshot.familyId !== filter.familyId) return false;
    if (filter.modality && !snapshot.modalities.includes(filter.modality)) return false;
    if (!filter.includePointers && (snapshot.slugClass === "alias" || snapshot.slugClass === "snapshot")) return false;
    if (filter.verifiedOnly && !snapshot.attributionVerified) return false;
    if (cutoff && new Date(snapshot.firstSeen).getTime() < cutoff) return false;
    if (filter.query && !matchesQuery(snapshot, filter.query)) return false;
    return true;
  });
}

/** Newest-first: release date, then version, then first-seen. */
export function byRecency(a: ModelSnapshot, b: ModelSnapshot): number {
  const dates = (b.releaseDate ?? "").localeCompare(a.releaseDate ?? "");
  if (dates !== 0) return dates;
  const versions = compareVersions(parseSlug(a.slug), parseSlug(b.slug));
  if (versions !== 0) return versions;
  return b.firstSeen.localeCompare(a.firstSeen);
}

/** Exact slug lookup, then alias lookup, then a scored fuzzy fallback. */
export function findModel(state: WatcherState, needle: string): ModelSnapshot | undefined {
  const all = snapshots(state);
  const target = canonicalToken(parseSlug(needle).canonical);
  const exact = all.find((snapshot) => canonicalToken(snapshot.slug) === target);
  if (exact) return exact;
  const aliased = all.find((snapshot) => snapshot.slugAliases.some((alias) => canonicalToken(alias) === target));
  if (aliased) return aliased;
  const lower = needle.toLowerCase();
  const scored = all
    .filter((snapshot) => matchesQuery(snapshot, lower))
    .sort((a, b) => a.slug.length - b.slug.length || byRecency(a, b));
  return scored[0];
}

/** Resolves free text to a vendor id: `openai`, `OpenAI`, `Black Forest Labs`. */
export function resolveVendorId(input: string): string | undefined {
  const direct = vendorFromToken(input);
  if (direct) return direct.id;
  const lower = input.trim().toLowerCase();
  return VENDORS.find((vendor) => vendor.name.toLowerCase().includes(lower))?.id;
}

export interface VendorReport {
  vendorId: string;
  vendorName: string;
  country: string;
  homepage: string;
  total: number;
  byModality: Map<Modality, ModelSnapshot[]>;
  newest: ModelSnapshot[];
}

export function vendorReport(state: WatcherState, vendorId: string): VendorReport | undefined {
  const vendor = VENDOR_BY_ID.get(vendorId);
  if (!vendor) return undefined;
  const models = select(state, { vendorId }).sort(byRecency);
  const byModality = new Map<Modality, ModelSnapshot[]>();
  for (const model of models) {
    for (const modality of model.modalities as Modality[]) {
      const bucket = byModality.get(modality) ?? [];
      bucket.push(model);
      byModality.set(modality, bucket);
    }
  }
  return {
    vendorId,
    vendorName: vendor.name,
    country: vendor.country,
    homepage: vendor.homepage,
    total: models.length,
    byModality,
    newest: models.slice(0, 12),
  };
}

/** The current head of a family: highest version, preferring GA over preview. */
export function familyHead(state: WatcherState, familyId: string): ModelSnapshot[] {
  const family = FAMILY_BY_ID.get(familyId);
  if (!family) return [];
  const models = select(state, { familyId });
  const ranked = models.sort((a, b) => {
    const channels = channelRank(a) - channelRank(b);
    if (channels !== 0) return channels;
    return compareVersions(parseSlug(a.slug), parseSlug(b.slug));
  });
  return ranked;
}

function channelRank(snapshot: ModelSnapshot): number {
  return { ga: 0, snapshot: 1, alias: 2, preview: 3, experimental: 4, deprecated: 5, stealth: 6 }[snapshot.channel];
}

/** Models seen only on arenas or benchmarks, with no publisher attribution. */
export function stealthCandidates(state: WatcherState): ModelSnapshot[] {
  return snapshots(state)
    .filter((snapshot) => !snapshot.attributionVerified || snapshot.capabilities["stealth"] === true)
    .filter((snapshot) => snapshot.evidence.every((item) => item.sourceKind === "benchmark" || item.sourceKind === "aggregator"))
    .sort(byRecency);
}

export interface HealthReport {
  sources: number;
  healthy: number;
  failing: Array<{ id: string; failures: number; lastSuccess?: string }>;
  models: number;
  verified: number;
  vendorsSeen: number;
}

export function health(state: WatcherState, sourceIds: string[]): HealthReport {
  const failing = Object.entries(state.sources)
    .filter(([, source]) => source.failureCount > 0)
    .map(([id, source]) => ({
      id,
      failures: source.failureCount,
      ...(source.lastSuccess ? { lastSuccess: source.lastSuccess } : {}),
    }))
    .sort((a, b) => b.failures - a.failures);
  const all = snapshots(state);
  return {
    sources: sourceIds.length,
    healthy: sourceIds.length - failing.length,
    failing,
    models: all.length,
    verified: all.filter((snapshot) => snapshot.confidence === "verified").length,
    vendorsSeen: new Set(all.map((snapshot) => snapshot.vendorId).filter(Boolean)).size,
  };
}
