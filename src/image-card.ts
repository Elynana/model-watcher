import sharp from "sharp";
import type { ModelEvent } from "./types.ts";

function xml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);
}

function truncate(value: string, length: number): string {
  return value.length <= length ? value : `${value.slice(0, length - 1)}…`;
}

export async function renderModelCard(event: ModelEvent): Promise<Buffer> {
  const model = event.after;
  const verified = model.confidence === "verified";
  const accent = verified ? "#37d67a" : "#f6c344";
  const modalities = model.modalities.length ? model.modalities.join("  •  ") : "Specifications pending";
  const changed = event.type === "added" ? "NEW MODEL" : event.type === "verified" ? "NOW VERIFIED" : `UPDATED: ${event.changedFields.join(", ")}`;
  const specs = [
    ...Object.entries(model.limits).slice(0, 3).map(([key, value]) => `${key}: ${value}`),
    ...Object.entries(model.capabilities).slice(0, 2).map(([key, value]) => `${key}: ${value}`),
  ].join("   •   ") || "Details are limited to published evidence";
  const svg = `
    <svg width="1200" height="675" viewBox="0 0 1200 675" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#111827"/><stop offset="1" stop-color="#202a44"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="675" rx="32" fill="url(#bg)"/>
      <rect x="0" y="0" width="14" height="675" fill="${accent}"/>
      <text x="72" y="92" fill="${accent}" font-size="27" font-family="Arial, sans-serif" font-weight="700" letter-spacing="3">${xml(changed.toUpperCase())}</text>
      <text x="72" y="202" fill="#ffffff" font-size="66" font-family="Arial, sans-serif" font-weight="700">${xml(truncate(model.displayName, 28))}</text>
      <text x="72" y="260" fill="#aab4c8" font-size="30" font-family="Arial, sans-serif">${xml(truncate(model.owner ?? "Unknown creator", 42))}  •  ${xml(truncate(model.family, 34))}</text>
      <rect x="72" y="322" width="1056" height="2" fill="#39445c"/>
      <text x="72" y="390" fill="#dce4f2" font-size="28" font-family="Arial, sans-serif">${xml(truncate(modalities, 65))}</text>
      <text x="72" y="462" fill="#9eabc2" font-size="24" font-family="Arial, sans-serif">${xml(truncate(specs, 88))}</text>
      <rect x="72" y="535" width="210" height="58" rx="29" fill="${accent}" fill-opacity="0.15" stroke="${accent}"/>
      <text x="177" y="573" fill="${accent}" text-anchor="middle" font-size="23" font-family="Arial, sans-serif" font-weight="700">${verified ? "VERIFIED" : "EMERGING"}</text>
      <text x="1128" y="577" fill="#7f8ba3" text-anchor="end" font-size="20" font-family="Arial, sans-serif">MODEL WATCHER</text>
      <text x="72" y="634" fill="#647089" font-size="18" font-family="Arial, sans-serif">All facts are derived from linked evidence in the Discord message.</text>
    </svg>`;
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}
