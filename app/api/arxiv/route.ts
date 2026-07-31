import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

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

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const title = new URL(request.url).searchParams.get("title")?.trim();
  if (!title || title.length < 2) {
    return NextResponse.json({ error: "请输入至少 2 个字符的文章名" }, { status: 400 });
  }

  const query = new URLSearchParams({
    search_query: `ti:"${title.replaceAll('"', " ")}"`,
    start: "0",
    max_results: "5",
    sortBy: "relevance",
    sortOrder: "descending",
  });

  try {
    const response = await fetch(`https://export.arxiv.org/api/query?${query}`, {
      headers: {
        "User-Agent": "WisdomLoong/1.3 (internal research knowledge platform)",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });

    if (!response.ok) {
      throw new Error(`arXiv returned ${response.status}`);
    }

    const xml = await response.text();
    const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(
      (match) => match[1],
    );
    const results = entries.map((entry) => {
      const idUrl = element(entry, "id");
      const externalId = idUrl.split("/abs/").pop() ?? idUrl;
      const authors = [...entry.matchAll(/<author>([\s\S]*?)<\/author>/g)]
        .map((author) => element(author[1], "name"))
        .filter(Boolean);
      const alternateLink =
        entry.match(/<link[^>]+href="([^"]+)"[^>]+rel="alternate"[^>]*\/>/)?.[1] ??
        idUrl;

      return {
        title: element(entry, "title"),
        abstract: element(entry, "summary"),
        authors,
        publishedAt: element(entry, "published").slice(0, 10),
        publisher: inferPublisher(element(entry, "title")),
        sourceUrl: decodeXml(alternateLink),
        externalId,
      };
    });

    return NextResponse.json({ results });
  } catch (error) {
    console.error("arXiv lookup failed", error);
    return NextResponse.json(
      { error: "暂时无法连接 arXiv，请稍后重试" },
      { status: 502 },
    );
  }
}
