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

type OpenAlexLocation = {
  landing_page_url?: string | null;
  pdf_url?: string | null;
};
type OpenAlexWork = {
  display_name?: string;
  publication_date?: string;
  authorships?: Array<{ author?: { display_name?: string } }>;
  locations?: OpenAlexLocation[];
  abstract_inverted_index?: Record<string, number[]> | null;
};
type DataCiteWork = {
  id?: string;
  attributes?: {
    doi?: string;
    titles?: Array<{ title?: string }>;
    creators?: Array<{ name?: string; givenName?: string; familyName?: string }>;
    published?: string;
    dates?: Array<{ date?: string }>;
    descriptions?: Array<{ description?: string; descriptionType?: string }>;
  };
};

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

function reconstructOpenAlexAbstract(index: OpenAlexWork["abstract_inverted_index"]) {
  if (!index) return "";
  return Object.entries(index)
    .flatMap(([word, positions]) => positions.map((position) => ({ word, position })))
    .sort((left, right) => left.position - right.position)
    .map(({ word }) => word)
    .join(" ");
}

function extractArxivId(locations: OpenAlexLocation[] | undefined) {
  for (const location of locations ?? []) {
    for (const url of [location.landing_page_url, location.pdf_url]) {
      if (!url) continue;
      const arxivId = normalizeArxivId(url);
      if (arxivId) return arxivId;
    }
  }
  return null;
}

function titleRelevance(title: string, query: string) {
  const normalize = (value: string) => value
    .toLocaleLowerCase("en-US")
    .replaceAll("π", "pi")
    .replaceAll("₀", "0")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/pi\s*0/g, "pi0")
    .trim();
  const normalizedTitle = normalize(title);
  const normalizedQuery = normalize(query);
  if (normalizedQuery.includes("saycan") && normalizedTitle.includes("do as i can not as i say")) return 10;
  if (normalizedTitle === normalizedQuery) return 20;
  if (normalizedTitle.includes(normalizedQuery)) return 10;
  const ignored = new Set(["a", "an", "and", "as", "for", "in", "is", "of", "the", "to", "with"]);
  const tokens = normalizedQuery.split(" ").filter((token) => token && !ignored.has(token));
  if (tokens.length === 0) return 0;
  return tokens.filter((token) => normalizedTitle.includes(token)).length / tokens.length;
}

function expandPaperAlias(title: string) {
  const key = title.toLocaleLowerCase("en-US")
    .replaceAll("π", "pi")
    .replaceAll("₀", "0")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/pi\s*0/g, "pi0")
    .trim();
  const aliases: Record<string, string> = {
    "openvla": "OpenVLA: An Open-Source Vision-Language-Action Model",
    "gemini robotics": "Gemini Robotics: Bringing AI into the Physical World",
    "gr00t n1": "GR00T N1: An Open Foundation Model for Generalist Humanoid Robots",
    "diffusion policy": "Diffusion Policy: Visuomotor Policy Learning via Action Diffusion",
    "rt 2 vision language action": "RT-2: Vision-Language-Action Models Transfer Web Knowledge to Robotic Control",
    "octo robot learning": "Octo: An Open-Source Generalist Robot Policy",
    "pi0 robot foundation model": "Vision-Language-Action Flow Model for General Robot Control",
    "mobile aloha": "Mobile ALOHA: Learning Bimanual Mobile Manipulation with Low-Cost Whole-Body Teleoperation",
    "saycan robot": "Do As I Can, Not As I Say: Grounding Language in Robotic Affordances",
    "robocasa": "RoboCasa: Large-Scale Simulation of Everyday Tasks for Generalist Robots",
    "droid robot dataset": "DROID: A Large-Scale In-The-Wild Robot Manipulation Dataset",
    "aloha unleashed": "ALOHA Unleashed: A Simple Recipe for Robot Dexterity",
    "palm e embodied": "PaLM-E: An Embodied Multimodal Language Model",
    "language models zero shot planners": "Language Models as Zero-Shot Planners: Extracting Actionable Knowledge for Embodied Agents",
    "code as policies": "Code as Policies: Language Model Programs for Embodied Control",
    "voyager minecraft": "Voyager: An Open-Ended Embodied Agent with Large Language Models",
    "generative agents": "Generative Agents: Interactive Simulacra of Human Behavior",
  };
  return aliases[key] ?? title;
}

function parseOpenAlexResults(payload: unknown, query: string): ArxivSearchResult[] {
  if (!payload || typeof payload !== "object") return [];
  const works = (payload as { results?: OpenAlexWork[] }).results;
  if (!Array.isArray(works)) return [];
  const seen = new Set<string>();
  return works.flatMap((work): ArxivSearchResult[] => {
    const externalId = extractArxivId(work.locations);
    const title = work.display_name?.trim();
    if (!externalId || !title || seen.has(externalId)) return [];
    seen.add(externalId);
    return [{
      title,
      abstract: reconstructOpenAlexAbstract(work.abstract_inverted_index),
      authors: work.authorships
        ?.map((authorship) => authorship.author?.display_name?.trim() ?? "")
        .filter(Boolean) ?? [],
      publishedAt: work.publication_date?.slice(0, 10) ?? "",
      publisher: inferPublisher(title),
      sourceUrl: `https://arxiv.org/abs/${externalId}`,
      externalId,
    }];
  }).sort((left, right) => titleRelevance(right.title, query) - titleRelevance(left.title, query)).slice(0, 5);
}

function parseDataCiteResults(payload: unknown, query: string): ArxivSearchResult[] {
  if (!payload || typeof payload !== "object") return [];
  const works = (payload as { data?: DataCiteWork[] }).data;
  if (!Array.isArray(works)) return [];
  return works.flatMap((work): ArxivSearchResult[] => {
    const attributes = work.attributes;
    const doi = (attributes?.doi ?? work.id ?? "").trim();
    const externalId = doi.match(/^10\.48550\/arxiv\.(.+)$/i)?.[1];
    const title = attributes?.titles?.[0]?.title?.trim();
    if (!externalId || !title || !normalizeArxivId(externalId)) return [];
    return [{
      title,
      abstract: attributes?.descriptions
        ?.find((description) => description.descriptionType === "Abstract")?.description?.trim() ?? "",
      authors: attributes?.creators?.map((creator) =>
        creator.name?.trim()
        || [creator.givenName?.trim(), creator.familyName?.trim()].filter(Boolean).join(" "),
      ).filter(Boolean) ?? [],
      publishedAt: (attributes?.published ?? attributes?.dates?.[0]?.date ?? "").slice(0, 10),
      publisher: inferPublisher(title),
      sourceUrl: `https://arxiv.org/abs/${externalId}`,
      externalId,
    }];
  }).sort((left, right) => titleRelevance(right.title, query) - titleRelevance(left.title, query)).slice(0, 5);
}

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timeout);
      reject(signal.reason);
    }, { once: true });
  });
}

function createRequestScheduler(intervalMs: number) {
  let queue = Promise.resolve();
  let nextStartAt = 0;
  return async (signal?: AbortSignal) => {
    const turn = queue.then(async () => {
      await wait(Math.max(0, nextStartAt - Date.now()), signal);
      if (signal?.aborted) throw signal.reason;
      nextStartAt = Date.now() + intervalMs;
    });
    queue = turn.catch(() => undefined);
    await turn;
  };
}

// Respect the upstream services' burst limits across all concurrent users.
// Queued requests are canceled when another provider has already succeeded.
const scheduleOfficialArxiv = createRequestScheduler(3_000);
const scheduleHuggingFace = createRequestScheduler(120);
const scheduleDataCite = createRequestScheduler(150);
const scheduleOpenAlex = createRequestScheduler(180);

async function fetchResponse(url: string, timeoutMs: number, signal?: AbortSignal) {
  return fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json, application/atom+xml;q=0.9" },
    cache: "no-store",
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
      : AbortSignal.timeout(timeoutMs),
  });
}

async function searchOfficialArxiv(title: string, signal?: AbortSignal) {
  await scheduleOfficialArxiv(signal);
  const arxivId = normalizeArxivId(title);
  const query = new URLSearchParams({
    ...(arxivId ? { id_list: arxivId } : { search_query: `ti:"${title.replaceAll('"', " ")}"` }),
    start: "0",
    max_results: "5",
    sortBy: "relevance",
    sortOrder: "descending",
  });
  const response = await fetchResponse(`https://export.arxiv.org/api/query?${query}`, 10_000, signal);
  if (!response.ok) {
    const error = new Error(`arXiv returned ${response.status}`) as Error & { retryable?: boolean };
    error.retryable = RETRYABLE_STATUSES.has(response.status);
    throw error;
  }
  return parseArxivXml(await response.text());
}

async function searchHuggingFace(title: string, signal?: AbortSignal) {
  const arxivId = normalizeArxivId(title);
  const url = arxivId
    ? `https://huggingface.co/api/papers/${encodeURIComponent(arxivId)}`
    : `https://huggingface.co/api/papers/search?q=${encodeURIComponent(title)}`;
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await scheduleHuggingFace(signal);
      const response = await fetchResponse(url, 12_000, signal);
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
    if (attempt < 2) await wait(500 * 2 ** attempt, signal);
  }
  throw lastError instanceof Error ? lastError : new Error("arXiv fallback failed");
}

async function searchDataCite(title: string, signal?: AbortSignal) {
  await scheduleDataCite(signal);
  const expandedTitle = expandPaperAlias(title);
  const query = new URLSearchParams({
    query: `titles.title:"${expandedTitle.replaceAll('"', " ")}"`,
    "page[size]": "50",
  });
  const response = await fetchResponse(`https://api.datacite.org/dois?${query}`, 15_000, signal);
  if (!response.ok) throw new Error(`DataCite returned ${response.status}`);
  return parseDataCiteResults(await response.json(), title);
}

async function requestOpenAlex(title: string, signal?: AbortSignal) {
  const expandedTitle = expandPaperAlias(title);
  const query = new URLSearchParams({
    search: expandedTitle,
    "per-page": "10",
    select: "display_name,publication_date,authorships,locations,abstract_inverted_index",
  });
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await scheduleOpenAlex(signal);
      const response = await fetchResponse(`https://api.openalex.org/works?${query}`, 12_000, signal);
      if (response.ok) return await response.json() as unknown;
      const error = new Error(`OpenAlex returned ${response.status}`);
      if (!RETRYABLE_STATUSES.has(response.status)) throw error;
      lastError = error;
    } catch (error) {
      lastError = error;
      if (signal?.aborted) throw error;
    }
    if (attempt < 3) await wait((600 * 2 ** attempt) + Math.random() * 300, signal);
  }
  throw lastError instanceof Error ? lastError : new Error("OpenAlex fallback failed");
}

async function searchOpenAlex(title: string, signal?: AbortSignal) {
  const firstPayload = await requestOpenAlex(title, signal);
  const firstWorks = (firstPayload as { results?: OpenAlexWork[] }).results ?? [];
  const firstWork = firstWorks[0];
  const firstTitle = firstWork?.display_name?.trim();
  if (!firstTitle || extractArxivId(firstWork.locations) || firstTitle.toLocaleLowerCase() === title.trim().toLocaleLowerCase()) {
    return parseOpenAlexResults(firstPayload, title);
  }

  // OpenAlex can merge the arXiv copy into a duplicate work that only appears
  // when searching the canonical title (for example Diffusion Policy/SayCan).
  const exactPayload = await requestOpenAlex(firstTitle, signal);
  return parseOpenAlexResults({
    results: [...firstWorks, ...((exactPayload as { results?: OpenAlexWork[] }).results ?? [])],
  }, title);
}

const cache = new Map<string, { expiresAt: number; results: ArxivSearchResult[] }>();
const inFlight = new Map<string, Promise<ArxivSearchResult[]>>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 200;

export async function searchArxiv(title: string) {
  const key = title.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.results;
  const existing = inFlight.get(key);
  if (existing) return existing;

  const lookup = (async () => {
    const controller = new AbortController();
    const useful = (promise: Promise<ArxivSearchResult[]>, provider: string) =>
      promise.then((results) => {
        if (results.length === 0) throw new Error(`${provider} returned no results`);
        return results;
      });
    try {
      // Give the official API a short head start, then progressively add three
      // independent arXiv-indexed providers. Abort the remaining requests as
      // soon as one source succeeds so normal traffic does not amplify load.
      const results = await Promise.any([
        useful(searchOfficialArxiv(title, controller.signal), "Official arXiv"),
        useful(wait(500, controller.signal).then(
          () => searchHuggingFace(title, controller.signal),
        ), "arXiv fallback"),
        useful(wait(900, controller.signal).then(
          () => searchDataCite(title, controller.signal),
        ), "DataCite fallback"),
        useful(wait(3_000, controller.signal).then(
          () => searchOpenAlex(title, controller.signal),
        ), "OpenAlex fallback"),
      ]);
      controller.abort();
      return results;
    } catch (error) {
      controller.abort();
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
