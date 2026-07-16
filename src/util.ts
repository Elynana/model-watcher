import { createHash } from "node:crypto";

const domainLastRequest = new Map<string, number>();

export function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

export function canonicalToken(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[™®©]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function modelKey(family: string, modelId: string): string {
  const id = modelId.includes("/") ? modelId.split("/").at(-1)! : modelId;
  return `${canonicalToken(family)}::${canonicalToken(id)}`;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function due(lastChecked: string | undefined, intervalMinutes: number, now = new Date()): boolean {
  if (!lastChecked) return true;
  return now.getTime() - new Date(lastChecked).getTime() >= intervalMinutes * 60_000;
}

export function newYorkClock(now = new Date()): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

export async function fetchDocument(
  url: string,
  cache: { etag?: string; lastModified?: string } = {},
  init: RequestInit = {},
  options: { timeoutMs?: number; retries?: number; minDomainDelayMs?: number } = {},
) {
  const timeoutMs = options.timeoutMs ?? 20_000;
  const retries = options.retries ?? 2;
  const minDomainDelayMs = options.minDomainDelayMs ?? 350;
  const host = new URL(url).host;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const elapsed = Date.now() - (domainLastRequest.get(host) ?? 0);
    if (elapsed < minDomainDelayMs) await sleep(minDomainDelayMs - elapsed);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      domainLastRequest.set(host, Date.now());
      const headers = new Headers(init.headers);
      headers.set("user-agent", "model-watcher/1.0 (public GitHub Actions; contact via repository)");
      headers.set("accept", "application/json, application/atom+xml, application/rss+xml, text/html;q=0.9, */*;q=0.5");
      if (cache.etag) headers.set("if-none-match", cache.etag);
      if (cache.lastModified) headers.set("if-modified-since", cache.lastModified);
      const response = await fetch(url, { ...init, headers, signal: controller.signal });
      const fetchedAt = new Date().toISOString();
      if (response.status === 304) {
        return { url, status: 304 as const, body: "", fetchedAt };
      }
      if (!response.ok) {
        if ((response.status === 429 || response.status >= 500) && attempt < retries) {
          await sleep(750 * 2 ** attempt);
          continue;
        }
        throw new Error(`HTTP ${response.status} for ${new URL(url).origin}${new URL(url).pathname}`);
      }
      return {
        url,
        status: 200 as const,
        body: await response.text(),
        contentType: response.headers.get("content-type") ?? undefined,
        etag: response.headers.get("etag") ?? undefined,
        lastModified: response.headers.get("last-modified") ?? undefined,
        fetchedAt,
      };
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(750 * 2 ** attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function pruneRecord<T>(record: Record<string, T>, keep: (value: T) => boolean): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => keep(value)));
}
