// Compress & encode a canvas report into a URL-safe string, and decode it back.
// Uses native CompressionStream (supported in all modern browsers).

import type { CanvasResult } from "./canvas-store";

export interface SharedReport {
  name: string;
  query: string;
  result: CanvasResult;
  sharedAt: number;
}

async function compress(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const stream = new Blob([encoder.encode(data)])
    .stream()
    .pipeThrough(new CompressionStream("deflate-raw"));
  const compressed = await new Response(stream).arrayBuffer();
  // Base64url encode
  const bytes = new Uint8Array(compressed);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function decompress(encoded: string): Promise<string> {
  // Base64url decode
  let base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) base64 += "=";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  const decompressed = await new Response(stream).text();
  return decompressed;
}

export async function encodeReport(report: SharedReport): Promise<string> {
  const json = JSON.stringify(report);
  return compress(json);
}

export async function decodeReport(encoded: string): Promise<SharedReport> {
  const json = await decompress(encoded);
  return JSON.parse(json);
}

export function buildShareUrl(encoded: string): string {
  return `${window.location.origin}/canvas?report=${encoded}`;
}
