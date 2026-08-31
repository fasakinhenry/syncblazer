import { api } from "@/lib/api.ts";

export interface LinkPreviewData {
  url: string;
  title: string;
  description: string | null;
  image: string | null;
}

const URL_PATTERN = /\bhttps?:\/\/[^\s)<>"'\]]+/gi;
const MAX_LINKS_PER_NOTE = 6;

/** Bare URLs found in a note's markdown, in order of first appearance, deduped. */
export function extractUrls(markdown: string): string[] {
  const matches = markdown.match(URL_PATTERN) ?? [];
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const raw of matches) {
    const cleaned = raw.replace(/[.,;:!?]+$/, "");
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    urls.push(cleaned);
    if (urls.length >= MAX_LINKS_PER_NOTE) break;
  }
  return urls;
}

const CACHE_KEY = "syncblaze.linkPreviewCache";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // a week is plenty for a page's title/image to stay accurate

interface CacheEntry {
  data: LinkPreviewData;
  fetchedAt: number;
}

function readCache(): Record<string, CacheEntry> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, CacheEntry>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Storage full/unavailable — previews just won't persist across reloads.
  }
}

const inFlight = new Map<string, Promise<LinkPreviewData | null>>();

export async function getLinkPreview(url: string): Promise<LinkPreviewData | null> {
  const cache = readCache();
  const cached = cache[url];
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.data;

  const existing = inFlight.get(url);
  if (existing) return existing;

  const promise = api.linkPreview
    .get(url)
    .then((data) => {
      const fresh = readCache();
      fresh[url] = { data, fetchedAt: Date.now() };
      writeCache(fresh);
      return data;
    })
    .catch(() => null)
    .finally(() => {
      inFlight.delete(url);
    });

  inFlight.set(url, promise);
  return promise;
}
