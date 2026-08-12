export type ArxivSearchResult = {
  title: string;
  abstract: string;
  authors: string[];
  publishedAt: string;
  publisher: string;
  sourceUrl: string;
  externalId: string;
};

const USER_AGENT = "WisdomLoong/2.3 (internal research knowledge platform)";
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

function decodeXml(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replace(/\s+/g, " ")
    .trim();
}

function element(xml: string, name: string) {
  const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`));
  return match ? decodeXml(match[1]) : "";
}

function inferPublisher(title: string) {
  const normalized = title.toLocaleLowerCase();
  if (normalized.includes("π0.5") || normalized.includes("pi0.5") || normalized.includes("π0")) {
    return "Physical Intelligence";
  }
  if (normalized.includes("gemini robotics")) return "Google DeepMind";
  if (normalized.includes("gr00t")) return "NVIDIA";
  if (normalized.includes("openvla")) return "Stanford University";
  return "机构待补充";
}

function normalizeArxivId(value: string) {
  const trimmed = value.trim();
  const fromUrl = trimmed.match(/arxiv\.org\/(?:abs|pdf)\/([^/?#]+?)(?:\.pdf)?(?:[?#]|$)/i)?.[1];
  const candidate = fromUrl ?? trimmed.replace(/^arxiv:\s*/i, "");
  return /^(?:[a-z-]+(?:\.[A-Z]{2})?\/\d{7}|\d{4}\.\d{4,5})(?:v\d+)?$/i.test(candidate)
    ? candidate
    : null;
}

function parseArxivXml(xml: string): ArxivSearchResult[] {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((match) => {
    const entry = match[1];
    const idUrl = element(entry, "id");
    const externalId = idUrl.split("/abs/").pop() ?? idUrl;
    const title = element(entry, "title");
    const authors = [...entry.matchAll(/<author>([\s\S]*?)<\/author>/g)]
      .map((author) => element(author[1], "name"))
      .filter(Boolean);
    const alternateLink =
      entry.match(/<link[^>]+href="([^"]+)"[^>]+rel="alternate"[^>]*\/>/)?.[1] ?? idUrl;

    return {
      title,
      abstract: element(entry, "summary"),
      authors,
      publishedAt: element(entry, "published").slice(0, 10),
      publisher: inferPublisher(title),
      sourceUrl: decodeXml(alternateLink),
      externalId,
    };
  });
}

type HuggingFaceAuthor = { name?: string };
type HuggingFacePaper = {
  id?: string;
  title?: string;
  summary?: string;
  publishedAt?: string;
  authors?: HuggingFaceAuthor[];
};
type HuggingFaceEntry = HuggingFacePaper & { paper?: HuggingFacePaper };

function parseHuggingFaceResults(payload: unknown): ArxivSearchResult[] {
  const entries = Array.isArray(payload) ? payload : [payload];
  return entries.flatMap((raw): ArxivSearchResult[] => {
    if (!raw || typeof raw !== "object") return [];
    const entry = raw as HuggingFaceEntry;
    const paper = entry.paper ?? entry;
    const externalId = paper.id?.trim();
    const title = (paper.title ?? entry.title)?.trim();
    if (!externalId || !title || !normalizeArxivId(externalId)) return [];
    const authors = paper.authors?.map((author) => author.name?.trim() ?? "").filter(Boolean) ?? [];
    return [{
      title,
      abstract: (paper.summary ?? entry.summary)?.trim() ?? "",
      authors,
      publishedAt: (paper.publishedAt ?? entry.publishedAt)?.slice(0, 10) ?? "",
      publisher: inferPublisher(title),
      sourceUrl: `https://arxiv.org/abs/${externalId}`,
      externalId,
    }];
  }).slice(0, 5);
}

async function fetchResponse(url: string, timeoutMs: number) {
  return fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json, application/atom+xml;q=0.9" },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
}

async function searchOfficialArxiv(title: string) {
  const arxivId = normalizeArxivId(title);
  const query = new URLSearchParams({
    ...(arxivId ? { id_list: arxivId } : { search_query: `ti:"${title.replaceAll('"', " ")}"` }),
    start: "0",
    max_results: "5",
    sortBy: "relevance",
    sortOrder: "descending",
  });
  const response = await fetchResponse(`https://export.arxiv.org/api/query?${query}`, 10_000);
  if (!response.ok) {
    const error = new Error(`arXiv returned ${response.status}`) as Error & { retryable?: boolean };
    error.retryable = RETRYABLE_STATUSES.has(response.status);
    throw error;
  }
  return parseArxivXml(await response.text());
}

async function searchHuggingFace(title: string) {
  const arxivId = normalizeArxivId(title);
  const url = arxivId
    ? `https://huggingface.co/api/papers/${encodeURIComponent(arxivId)}`
    : `https://huggingface.co/api/papers/search?q=${encodeURIComponent(title)}`;
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetchResponse(url, 12_000);
      if (!response.ok) {
        const error = new Error(`fallback returned ${response.status}`);
        if (!RETRYABLE_STATUSES.has(response.status)) throw error;
        lastError = error;
      } else {
        return parseHuggingFaceResults(await response.json());
      }
    } catch (error) {
      lastError = error;
    }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
  }
  throw lastError instanceof Error ? lastError : new Error("arXiv fallback failed");
}

const cache = new Map<string, { expiresAt: number; results: ArxivSearchResult[] }>();
const inFlight = new Map<string, Promise<ArxivSearchResult[]>>();
const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_CACHE_ENTRIES = 200;

export async function searchArxiv(title: string) {
  const key = title.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.results;
  const existing = inFlight.get(key);
  if (existing) return existing;

  const lookup = (async () => {
    const useful = (promise: Promise<ArxivSearchResult[]>, provider: string) =>
      promise.then((results) => {
        if (results.length === 0) throw new Error(`${provider} returned no results`);
        return results;
      });
    try {
      // Start both independent providers together. Promise.any keeps one slow or
      // rate-limited upstream from delaying a healthy response.
      return await Promise.any([
        useful(searchOfficialArxiv(title), "Official arXiv"),
        useful(searchHuggingFace(title), "arXiv fallback"),
      ]);
    } catch (error) {
      if (error instanceof AggregateError && error.errors.every(
        (item) => item instanceof Error && item.message.endsWith("returned no results"),
      )) return [];
      throw error;
    }
  })();
  inFlight.set(key, lookup);
  try {
    const results = await lookup;
    if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value ?? "");
    cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, results });
    return results;
  } finally {
    inFlight.delete(key);
  }
}
