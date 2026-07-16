import { applySourceResults } from "./engine.ts";
import { renderEvent, sendDigest, sendEvent } from "./discord.ts";
import { loadState, saveState } from "./state.ts";
import { SOURCES } from "./sources/registry.ts";
import { runSources } from "./sources/runner.ts";
import type { ModelEvent, WatcherState } from "./types.ts";
import { env, newYorkClock } from "./util.ts";

interface Args {
  dryRun: boolean;
  seed: boolean;
  force: boolean;
  shadow: boolean;
}

function parseArgs(args: string[]): Args {
  const has = (name: string) => args.includes(`--${name}`);
  return {
    dryRun: has("dry-run"),
    seed: has("seed"),
    force: has("force"),
    shadow: has("shadow") || env("SHADOW_MODE") === "1",
  };
}

function queueEvents(state: WatcherState, events: ModelEvent[], seed: boolean): void {
  if (seed) return;
  for (const event of events) {
    if (state.delivery.sent[event.id]) continue;
    const target = event.importance === "major" ? state.delivery.pendingMajor : state.digest.pending;
    if (!target.some((queued) => queued.id === event.id)) target.push(event);
  }
}

async function deliverMajor(state: WatcherState, args: Args): Promise<void> {
  if (args.dryRun) {
    for (const event of state.delivery.pendingMajor) console.log("[dry immediate]", JSON.stringify(renderEvent(event), null, 2));
    return;
  }
  const remaining: ModelEvent[] = [];
  for (const event of state.delivery.pendingMajor) {
    const delivered = await sendEvent(event, { shadow: args.shadow, image: env("IMAGE_CARDS") !== "0" });
    if (delivered) state.delivery.sent[event.id] = new Date().toISOString();
    else remaining.push(event);
  }
  state.delivery.pendingMajor = remaining;
}

async function deliverDigest(state: WatcherState, args: Args): Promise<void> {
  const clock = newYorkClock();
  if (clock.hour < 9 || state.digest.lastPostedLocalDate === clock.date || state.digest.pending.length === 0) return;
  if (args.dryRun) {
    console.log(`[dry digest] ${state.digest.pending.length} queued minor events for ${clock.date}`);
    return;
  }
  const delivered = await sendDigest(state.digest.pending, { shadow: args.shadow });
  if (!delivered) return;
  for (const event of state.digest.pending) state.delivery.sent[event.id] = new Date().toISOString();
  state.digest.pending = [];
  state.digest.lastPostedLocalDate = clock.date;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const state = await loadState();
  console.log(`model-watcher: ${SOURCES.length} sources configured${args.shadow ? " · SHADOW MODE" : ""}`);
  const runs = await runSources(SOURCES, state, { force: args.force || args.dryRun || args.seed });
  const events = applySourceResults(state, runs);
  queueEvents(state, events, args.seed);
  console.log(`Summary: ${runs.filter((run) => run.status === "ok").length} refreshed, ${events.length} events, ${state.delivery.pendingMajor.length} immediate queued, ${state.digest.pending.length} digest queued.`);
  await deliverMajor(state, args);
  await deliverDigest(state, args);
  if (args.dryRun) {
    console.log("[dry-run] State and Discord were not changed.");
    return;
  }
  await saveState(state);
  console.log(args.seed ? "Silent baseline saved." : "State saved.");
}

main().catch((error) => {
  console.error("Fatal:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
