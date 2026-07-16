import type { SourceAdapter, SourceRunResult, WatcherState } from "../types.ts";
import { emptySourceState } from "../state.ts";
import { due, sha256 } from "../util.ts";
import { sourceRunFailure } from "../engine.ts";

export async function runSources(
  sources: SourceAdapter[],
  state: WatcherState,
  options: { force?: boolean } = {},
): Promise<SourceRunResult[]> {
  const results: SourceRunResult[] = [];
  for (const source of sources) {
    const current = state.sources[source.id] ?? emptySourceState();
    const wasBaseline = !current.baselineComplete;
    if (!source.enabled()) {
      results.push({ source, status: "skipped", observations: [], wasBaseline });
      console.log(`[skip] ${source.id} (optional credentials unavailable)`);
      continue;
    }
    if (!options.force && !due(current.lastChecked, source.intervalMinutes)) {
      results.push({ source, status: "skipped", observations: [], wasBaseline });
      continue;
    }
    try {
      const document = await source.fetch(current);
      if (document.status === 304) {
        results.push({ source, status: "not-modified", observations: [], document, wasBaseline });
        console.log(`[304]  ${source.id}`);
        continue;
      }
      const observations = source.parse(document);
      if (observations.length > 5000) throw new Error(`parser returned an unsafe ${observations.length} observations`);
      if (source.tracksRemovals && current.modelKeys.length > 0 && observations.length === 0) {
        throw new Error("parser returned zero models for a previously populated authoritative source");
      }
      current.fingerprint = sha256(document.body);
      results.push({ source, status: "ok", observations, document, wasBaseline });
      console.log(`[ok]   ${source.id}: ${observations.length} models`);
    } catch (error) {
      const failure = sourceRunFailure(source, error, wasBaseline);
      results.push(failure);
      console.error(`[fail] ${source.id}: ${failure.error}`);
    }
  }
  return results;
}
