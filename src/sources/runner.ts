import type { SourceAdapter, SourceRunResult, WatcherState } from "../types.ts";
import { emptySourceState } from "../state.ts";
import { due, mapLimit, sha256 } from "../util.ts";
import { sourceRunFailure } from "../engine.ts";

export interface RunOptions {
  force?: boolean;
  /** Parallel source fetches. Per-domain pacing still applies inside fetch. */
  concurrency?: number;
  /** Only run sources whose id contains this substring. */
  only?: string;
}

/**
 * Runs every due source. A source can only ever fail in isolation: a parser
 * error, an empty authoritative response, or an implausible result count is
 * recorded as a failure and can never delete a model from the catalog.
 */
export async function runSources(
  sources: SourceAdapter[],
  state: WatcherState,
  options: RunOptions = {},
): Promise<SourceRunResult[]> {
  const selected = options.only ? sources.filter((source) => source.id.includes(options.only!)) : sources;

  return mapLimit(selected, options.concurrency ?? 6, async (source): Promise<SourceRunResult> => {
    const current = state.sources[source.id] ?? emptySourceState();
    const wasBaseline = !current.baselineComplete;

    if (!source.enabled()) {
      return { source, status: "skipped", observations: [], wasBaseline };
    }
    if (!options.force && !due(current.lastChecked, source.intervalMinutes)) {
      return { source, status: "skipped", observations: [], wasBaseline };
    }
    try {
      const document = await source.fetch(current);
      if (document.status === 304) {
        console.log(`[304]  ${source.id}`);
        return { source, status: "not-modified", observations: [], document, wasBaseline };
      }
      const observations = source.parse(document);
      if (observations.length > 20_000) {
        throw new Error(`parser returned an implausible ${observations.length} observations`);
      }
      if (source.tracksRemovals && current.modelKeys.length > 0 && observations.length === 0) {
        throw new Error("parser returned zero models for a previously populated authoritative source");
      }
      console.log(`[ok]   ${source.id}: ${observations.length} models`);
      return { source, status: "ok", observations, document, wasBaseline };
    } catch (error) {
      const failure = sourceRunFailure(source, error, wasBaseline);
      console.error(`[fail] ${source.id}: ${failure.error}`);
      return failure;
    }
  });
}

/** Content hash of a fetched document, used for change detection in state. */
export const documentFingerprint = sha256;
