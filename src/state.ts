import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { DigestState, DeliveryState, ModelState, SourceState, WatcherState } from "./types.ts";
import { env, pruneRecord } from "./util.ts";

const stateDir = () => resolve(env("STATE_DIR") ?? "data/state");

async function readJson<T>(name: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(resolve(stateDir(), name), "utf8")) as T;
  } catch {
    return fallback;
  }
}

export async function loadState(): Promise<WatcherState> {
  const [models, sources, delivery, digest] = await Promise.all([
    readJson<Record<string, ModelState>>("models.json", {}),
    readJson<Record<string, SourceState>>("sources.json", {}),
    readJson<DeliveryState>("delivery.json", { sent: {}, pendingMajor: [] }),
    readJson<DigestState>("digest.json", { pending: [] }),
  ]);
  delivery.pendingMajor ??= [];
  return { models, sources, delivery, digest };
}

async function writeJson(name: string, value: unknown): Promise<void> {
  await writeFile(resolve(stateDir(), name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function saveState(state: WatcherState): Promise<void> {
  await mkdir(stateDir(), { recursive: true });
  const cutoff = Date.now() - 120 * 24 * 60 * 60_000;
  state.delivery.sent = pruneRecord(state.delivery.sent, (date) => new Date(date).getTime() >= cutoff);
  const sortedModels = Object.fromEntries(Object.entries(state.models).sort(([a], [b]) => a.localeCompare(b)));
  const sortedSources = Object.fromEntries(Object.entries(state.sources).sort(([a], [b]) => a.localeCompare(b)));
  await Promise.all([
    writeJson("models.json", sortedModels),
    writeJson("sources.json", sortedSources),
    writeJson("delivery.json", state.delivery),
    writeJson("digest.json", state.digest),
  ]);
}

export function emptySourceState(): SourceState {
  return { failureCount: 0, modelKeys: [], missingCounts: {}, baselineComplete: false };
}
