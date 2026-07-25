import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { DigestState, DeliveryState, ModelEvent, ModelSnapshot, ModelState, SourceState, Subscription, WatcherState } from "./types.ts";
import { canonicalToken, env, pruneRecord } from "./util.ts";

const stateDir = () => resolve(env("STATE_DIR") ?? "data/state");
const modelsDir = () => resolve(stateDir(), "models");

async function readJson<T>(name: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(resolve(stateDir(), name), "utf8")) as T;
  } catch {
    return fallback;
  }
}

/**
 * Models are sharded by publisher. A run that changes three OpenAI slugs
 * rewrites one small file instead of a single multi-megabyte blob, which
 * keeps the durable state branch from growing without bound.
 */
function shardOf(model: ModelState, key: string): string {
  const vendorId = model.snapshot?.vendorId;
  if (vendorId) return canonicalToken(vendorId);
  const family = key.split("::")[0] ?? "";
  return family ? `unattributed-${family.slice(0, 1)}` : "unattributed";
}

async function readModels(): Promise<Record<string, ModelState>> {
  const legacy = await readJson<Record<string, ModelState>>("models.json", {});
  const models: Record<string, ModelState> = { ...legacy };
  let files: string[];
  try {
    files = await readdir(modelsDir());
  } catch {
    return models;
  }
  await Promise.all(
    files
      .filter((file) => file.endsWith(".json"))
      .map(async (file) => {
        try {
          const shard = JSON.parse(await readFile(resolve(modelsDir(), file), "utf8")) as Record<string, ModelState>;
          Object.assign(models, shard);
        } catch (error) {
          console.error(`[state] ignoring unreadable shard ${file}: ${(error as Error).message}`);
        }
      }),
  );
  return models;
}

/**
 * True for a snapshot written before the multi-modal rebuild. The durable
 * state branch outlives any one schema, so records read back from it can
 * predate the slug, channel, and attribution fields every renderer now reads.
 */
export function isLegacySnapshot(snapshot: ModelSnapshot | undefined): boolean {
  if (!snapshot) return false;
  return (
    typeof snapshot.slug !== "string" ||
    typeof snapshot.channel !== "string" ||
    typeof snapshot.slugClass !== "string" ||
    !Array.isArray(snapshot.slugAliases)
  );
}

/**
 * A queued event describes one moment that has already passed, so a legacy
 * one cannot be rebuilt from anything still on disk — and rendering it would
 * abort the run before any other event was delivered. Dropping it is safe:
 * whatever it reported is re-derived from the current sources on this run.
 */
function deliverable(events: ModelEvent[] | undefined, label: string): ModelEvent[] {
  const kept = (events ?? []).filter((event) => event?.after && !isLegacySnapshot(event.after));
  const dropped = (events ?? []).length - kept.length;
  if (dropped) console.log(`[state] dropped ${dropped} ${label} event(s) queued under an older schema`);
  return kept;
}

export async function loadState(): Promise<WatcherState> {
  const [models, sources, delivery, digest, subscriptions] = await Promise.all([
    readModels(),
    readJson<Record<string, SourceState>>("sources.json", {}),
    readJson<DeliveryState>("delivery.json", { sent: {}, pendingMajor: [] }),
    readJson<DigestState>("digest.json", { pending: [] }),
    readJson<Record<string, Subscription>>("subscriptions.json", {}),
  ]);
  delivery.pendingMajor = deliverable(delivery.pendingMajor, "immediate");
  digest.pending = deliverable(digest.pending, "digest");
  return { models, sources, delivery, digest, subscriptions };
}

function sortKeys<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}

async function writeJson(name: string, value: unknown, pretty = true): Promise<void> {
  const body = pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value);
  await writeFile(resolve(stateDir(), name), `${body}\n`, "utf8");
}

async function writeModels(models: Record<string, ModelState>): Promise<void> {
  await mkdir(modelsDir(), { recursive: true });
  const shards = new Map<string, Record<string, ModelState>>();
  for (const [key, model] of Object.entries(models)) {
    const shard = shardOf(model, key);
    const bucket = shards.get(shard) ?? {};
    bucket[key] = model;
    shards.set(shard, bucket);
  }
  await Promise.all(
    [...shards].map(([shard, bucket]) => writeJson(`models/${shard}.json`, sortKeys(bucket), false)),
  );

  // Retire shards whose publisher no longer has any tracked model.
  const existing = await readdir(modelsDir()).catch(() => [] as string[]);
  await Promise.all(
    existing
      .filter((file) => file.endsWith(".json") && !shards.has(file.replace(/\.json$/, "")))
      .map((file) => rm(resolve(modelsDir(), file), { force: true })),
  );
  await rm(resolve(stateDir(), "models.json"), { force: true });
}

export async function saveState(state: WatcherState): Promise<void> {
  await mkdir(stateDir(), { recursive: true });
  const cutoff = Date.now() - 120 * 24 * 60 * 60_000;
  state.delivery.sent = pruneRecord(state.delivery.sent, (date) => new Date(date).getTime() >= cutoff);
  await Promise.all([
    writeModels(state.models),
    writeJson("sources.json", sortKeys(state.sources), false),
    writeJson("delivery.json", state.delivery),
    writeJson("digest.json", state.digest),
    writeJson("subscriptions.json", state.subscriptions),
  ]);
}

export function emptySourceState(): SourceState {
  return { failureCount: 0, modelKeys: [], missingCounts: {}, baselineComplete: false };
}
