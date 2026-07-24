import { applySourceResults } from "./engine.ts";
import { sendDigest, sendEvent } from "./discord.ts";
import { loadState, saveState } from "./state.ts";
import { SOURCES, coverage } from "./sources/registry.ts";
import { runSources } from "./sources/runner.ts";
import { modelEmbed } from "./render.ts";
import type { ModelEvent, WatcherState } from "./types.ts";
import { env, newYorkClock } from "./util.ts";

interface Args {
  dryRun: boolean;
  seed: boolean;
  force: boolean;
  shadow: boolean;
  only?: string;
  concurrency: number;
}

function parseArgs(argv: string[]): Args {
  const has = (name: string) => argv.includes(`--${name}`);
  const value = (name: string) => argv.find((argument) => argument.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
  const only = value("only");
  return {
    dryRun: has("dry-run"),
    seed: has("seed"),
    force: has("force"),
    shadow: has("shadow") || env("SHADOW_MODE") === "1",
    ...(only ? { only } : {}),
    concurrency: Math.min(Math.max(Number(value("concurrency") ?? env("CONCURRENCY") ?? 6) || 6, 1), 16),
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
    for (const event of state.delivery.pendingMajor.slice(0, 20)) {
      console.log("[dry immediate]", JSON.stringify(modelEmbed(event.after, event), null, 2));
    }
    if (state.delivery.pendingMajor.length > 20) {
      console.log(`[dry immediate] …and ${state.delivery.pendingMajor.length - 20} more`);
    }
    return;
  }
  const remaining: ModelEvent[] = [];
  for (const event of state.delivery.pendingMajor) {
    const delivered = await sendEvent(event, state, { shadow: args.shadow, image: env("IMAGE_CARDS") !== "0" });
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
  const delivered = await sendDigest(state.digest.pending, state, { shadow: args.shadow });
  if (!delivered) return;
  for (const event of state.digest.pending) state.delivery.sent[event.id] = new Date().toISOString();
  state.digest.pending = [];
  state.digest.lastPostedLocalDate = clock.date;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const state = await loadState();
  const report = coverage();
  console.log(
    `model-watcher: ${report.enabled}/${report.total} sources enabled · ` +
      `${report.vendorsCovered}/${report.vendorsTotal} publishers with a first-party source` +
      `${args.shadow ? " · SHADOW MODE" : ""}`,
  );

  const runs = await runSources(SOURCES, state, {
    force: args.force || args.dryRun || args.seed,
    concurrency: args.concurrency,
    ...(args.only ? { only: args.only } : {}),
  });
  const events = applySourceResults(state, runs);
  queueEvents(state, events, args.seed);

  const ok = runs.filter((run) => run.status === "ok").length;
  const failed = runs.filter((run) => run.status === "failed").length;
  console.log(
    `Summary: ${ok} refreshed, ${failed} failed, ${Object.keys(state.models).length} models tracked, ` +
      `${events.length} events, ${state.delivery.pendingMajor.length} immediate queued, ${state.digest.pending.length} digest queued.`,
  );

  await deliverMajor(state, args);
  await deliverDigest(state, args);

  if (args.dryRun) {
    console.log("[dry-run] State and Discord were not changed.");
    return;
  }
  await saveState(state);
  console.log(args.seed ? "Silent baseline saved." : "State saved.");
}

main().catch((error: unknown) => {
  console.error("Fatal:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
