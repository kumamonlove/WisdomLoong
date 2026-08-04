import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { promisify } from "node:util";
import { getAcademicTranslationConfig } from "@/lib/academic-translation";
import { database } from "@/lib/db";
import { pdfCachePath } from "@/lib/pdf-cache";

const execFileAsync = promisify(execFile);

export type KnowledgeGraphDomain = {
  domain: string;
  articleCount: number;
  analyzedCount: number;
  narrative: string;
  status: "pending" | "ready" | "error";
  updatedAt: string | null;
};

export type KnowledgeGraphNode = {
  articleId: number;
  title: string;
  publishedAt: string | null;
  publisher: string;
  contribution: string;
  lineageReason: string;
  parentArticleIds: number[];
  analysisSource: "title" | "abstract" | "fulltext";
};

export type KnowledgeGraphData = KnowledgeGraphDomain & {
  nodes: KnowledgeGraphNode[];
};

type GraphArticle = {
  id: number;
  title: string;
  abstract: string;
  abstractZh: string;
  authors: string[];
  publisher: string;
  publishedAt: string | null;
  createdAt: string;
};

type AiGraph = {
  narrative?: unknown;
  nodes?: {
    articleId?: unknown;
    contribution?: unknown;
    lineageReason?: unknown;
    parentArticleIds?: unknown;
  }[];
};

const activeDomainRefreshes = new Map<string, Promise<void>>();
const knowledgeGraphAnalysisVersion = 2;

function compactText(value: string, length: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, length);
}

function fallbackContribution(article: GraphArticle) {
  const evidence = compactText(article.abstractZh || article.abstract, 90);
  return evidence || `围绕“${compactText(article.title, 68)}”提出该领域的一项研究方案。`;
}

async function fullTextEvidence(articleId: number) {
  const path = pdfCachePath(articleId);
  try {
    await access(path);
    const { stdout } = await execFileAsync(
      "pdftotext",
      ["-f", "1", "-l", "12", "-raw", "-enc", "UTF-8", path, "-"],
      { maxBuffer: 2 * 1024 * 1024, timeout: 30_000 },
    );
    return compactText(stdout, 8_000);
  } catch {
    return "";
  }
}

async function articleEvidence(article: GraphArticle) {
  const abstract = compactText(article.abstractZh || article.abstract, 4_500);
  if (abstract) return { source: "abstract" as const, text: abstract };
  const fulltext = await fullTextEvidence(article.id);
  if (fulltext) return { source: "fulltext" as const, text: fulltext };
  return { source: "title" as const, text: article.title };
}

function parseJsonObject(value: string) {
  const normalized = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = normalized.indexOf("{");
  const end = normalized.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("knowledge graph AI returned invalid JSON");
  return JSON.parse(normalized.slice(start, end + 1)) as AiGraph;
}

async function requestGraphAnalysis(domain: string, articles: GraphArticle[], previousNarrative: string) {
  const { apiKey, baseUrl, model } = getAcademicTranslationConfig();
  if (!apiKey) throw new Error("knowledge graph AI key is not configured");

  const evidence = await Promise.all(articles.map(async (article) => ({
    articleId: article.id,
    title: article.title,
    date: article.publishedAt || article.createdAt.slice(0, 10),
    publisher: article.publisher === "机构待补充" || article.publisher.toLocaleLowerCase() === "arxiv"
      ? ""
      : article.publisher,
    ...(await articleEvidence(article)),
  })));
  const requestBody = JSON.stringify({
    model,
    temperature: 0.1,
    stream: false,
    max_tokens: Math.min(10_000, Math.max(1_200, articles.length * 280)),
    messages: [
      {
        role: "system",
        content: [
          "你是机器人学研究史与技术谱系编辑。请为指定领域维护一棵严格基于证据的论文发展树。",
          "父节点必须比子节点更早，且只有存在明确方法、问题定义、训练范式或思想继承时才能连接；没有可靠前驱就作为根节点。",
          "禁止仅按发表时间把论文串成单链。若多篇工作共同直接继承同一篇代表作，它们必须作为该代表作的并列分支；例如多篇论文都直接继承 pi0.5，就都把 pi0.5 设为父节点。",
          "每篇贡献用简洁中文写 25–70 字，说明它相对前序工作的新增价值，不能只改写标题。",
          "lineageReason 用 20–60 字解释继承关系；根节点说明它开启或汇合了什么方向。",
          "narrative 用 150–500 字维护该领域从早到晚的内部发展叙事，点出主要分支、汇合和仍未解决的问题。",
          "只返回 JSON：{narrative:string,nodes:[{articleId:number,contribution:string,lineageReason:string,parentArticleIds:number[]}]}。",
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({ domain, previousNarrative, articles: evidence }),
      },
    ],
  });

  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: requestBody,
        signal: AbortSignal.timeout(150_000),
      });
      const data = await response.json().catch(() => ({})) as {
        choices?: { message?: { content?: string } }[];
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(`knowledge graph AI failed (${response.status}): ${data.error?.message ?? "unknown error"}`);
      }
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error("knowledge graph AI returned empty content");
      return { graph: parseJsonObject(content), evidence };
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1_500));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("knowledge graph AI request failed");
}

export async function getKnowledgeGraphDomains() {
  const result = await database.query<KnowledgeGraphDomain>(
    `WITH domain_articles AS (
       SELECT tag AS domain, COUNT(DISTINCT articles.id)::int AS "articleCount"
       FROM articles
       CROSS JOIN LATERAL UNNEST(
         CASE WHEN CARDINALITY(articles.tags) > 0 THEN articles.tags ELSE ARRAY[articles.category] END
       ) tag
       WHERE tag <> '全部'
       GROUP BY tag
     ), analyzed AS (
       SELECT domain, COUNT(*)::int AS "analyzedCount"
       FROM knowledge_graph_nodes
       GROUP BY domain
     )
     SELECT
       domain_articles.domain,
       domain_articles."articleCount",
       COALESCE(analyzed."analyzedCount", 0)::int AS "analyzedCount",
       COALESCE(knowledge_graph_domains.narrative, '') AS narrative,
       CASE
         WHEN COALESCE(knowledge_graph_domains.analysis_version, 0) < ${knowledgeGraphAnalysisVersion} THEN 'pending'
         ELSE COALESCE(knowledge_graph_domains.status, 'pending')
       END AS status,
       knowledge_graph_domains.updated_at::text AS "updatedAt"
     FROM domain_articles
     LEFT JOIN knowledge_graph_domains USING (domain)
     LEFT JOIN analyzed USING (domain)
     ORDER BY domain_articles."articleCount" DESC, domain_articles.domain`,
  );
  return result.rows;
}

export async function getKnowledgeGraph(domain: string): Promise<KnowledgeGraphData> {
  const [domains, nodes] = await Promise.all([
    getKnowledgeGraphDomains(),
    database.query<KnowledgeGraphNode>(
      `SELECT
         articles.id AS "articleId",
         articles.title,
         articles.published_at::text AS "publishedAt",
         articles.publisher,
         COALESCE(knowledge_graph_nodes.contribution,
           NULLIF(LEFT(COALESCE(NULLIF(articles.abstract_zh, ''), articles.abstract), 180), ''),
           '等待 AI 总结该文章在本领域的贡献') AS contribution,
         COALESCE(knowledge_graph_nodes.lineage_reason, '') AS "lineageReason",
         COALESCE(knowledge_graph_nodes.parent_article_ids, '{}') AS "parentArticleIds",
         COALESCE(knowledge_graph_nodes.analysis_source, 'title') AS "analysisSource"
       FROM articles
       LEFT JOIN knowledge_graph_nodes
         ON knowledge_graph_nodes.article_id = articles.id
        AND knowledge_graph_nodes.domain = $1
       WHERE $1 = ANY(
         CASE WHEN CARDINALITY(articles.tags) > 0 THEN articles.tags ELSE ARRAY[articles.category] END
       )
       ORDER BY articles.published_at ASC NULLS LAST, articles.created_at ASC, articles.id ASC`,
      [domain],
    ),
  ]);
  const selected = domains.find((item) => item.domain === domain);
  return {
    domain,
    articleCount: selected?.articleCount ?? nodes.rows.length,
    analyzedCount: selected?.analyzedCount ?? 0,
    narrative: selected?.narrative ?? "",
    status: selected?.status ?? "pending",
    updatedAt: selected?.updatedAt ?? null,
    nodes: nodes.rows,
  };
}

async function rebuildDomain(domain: string) {
  const articlesResult = await database.query<GraphArticle>(
    `SELECT id, title, abstract, abstract_zh AS "abstractZh", authors, publisher,
            published_at::text AS "publishedAt", created_at::text AS "createdAt"
     FROM articles
     WHERE $1 = ANY(CASE WHEN CARDINALITY(tags) > 0 THEN tags ELSE ARRAY[category] END)
     ORDER BY published_at ASC NULLS LAST, created_at ASC, id ASC`,
    [domain],
  );
  const articles = articlesResult.rows;
  if (articles.length === 0) return;

  const previous = await database.query<{ narrative: string }>(
    "SELECT narrative FROM knowledge_graph_domains WHERE domain = $1",
    [domain],
  );
  await database.query(
    `INSERT INTO knowledge_graph_domains (domain, status, article_count, analysis_version, last_error)
     VALUES ($1, 'pending', $2, $3, '')
     ON CONFLICT (domain) DO UPDATE
     SET status = 'pending', article_count = EXCLUDED.article_count,
         analysis_version = EXCLUDED.analysis_version, last_error = '', updated_at = NOW()`,
    [domain, articles.length, knowledgeGraphAnalysisVersion],
  );

  try {
    const { graph, evidence } = await requestGraphAnalysis(domain, articles, previous.rows[0]?.narrative ?? "");
    const order = new Map(articles.map((article, index) => [article.id, index]));
    const aiNodes = new Map((graph.nodes ?? []).map((node) => [Number(node.articleId), node]));
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE knowledge_graph_domains
         SET narrative = $2, status = 'ready', article_count = $3,
             analysis_version = ${knowledgeGraphAnalysisVersion},
             last_error = '', updated_at = NOW()
         WHERE domain = $1`,
        [domain, compactText(typeof graph.narrative === "string" ? graph.narrative : "", 4_000), articles.length],
      );
      for (const [index, article] of articles.entries()) {
        const node = aiNodes.get(article.id);
        const parents = Array.isArray(node?.parentArticleIds)
          ? [...new Set(node.parentArticleIds.map(Number).filter((id) =>
              Number.isInteger(id) && id !== article.id && (order.get(id) ?? Infinity) < index
            ))].slice(0, 3)
          : [];
        const source = evidence.find((item) => item.articleId === article.id)?.source ?? "title";
        await client.query(
          `INSERT INTO knowledge_graph_nodes (
             domain, article_id, contribution, lineage_reason, parent_article_ids, analysis_source, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
           ON CONFLICT (domain, article_id) DO UPDATE
           SET contribution = EXCLUDED.contribution,
               lineage_reason = EXCLUDED.lineage_reason,
               parent_article_ids = EXCLUDED.parent_article_ids,
               analysis_source = EXCLUDED.analysis_source,
               updated_at = NOW()`,
          [
            domain,
            article.id,
            compactText(typeof node?.contribution === "string" ? node.contribution : fallbackContribution(article), 500),
            compactText(typeof node?.lineageReason === "string" ? node.lineageReason : "", 500),
            parents,
            source,
          ],
        );
      }
      await client.query(
        `DELETE FROM knowledge_graph_nodes
         WHERE domain = $1 AND NOT (article_id = ANY($2::integer[]))`,
        [domain, articles.map((article) => article.id)],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await database.query(
      `UPDATE knowledge_graph_domains
       SET status = 'error', last_error = $2, updated_at = NOW()
       WHERE domain = $1`,
      [domain, message.slice(0, 1_000)],
    );
    throw error;
  }
}

export function refreshKnowledgeGraphDomain(domain: string) {
  const normalized = domain.trim().slice(0, 24);
  if (!normalized || normalized === "全部") return Promise.resolve();
  const active = activeDomainRefreshes.get(normalized);
  if (active) return active;
  const refresh = rebuildDomain(normalized).finally(() => activeDomainRefreshes.delete(normalized));
  activeDomainRefreshes.set(normalized, refresh);
  return refresh;
}

export async function refreshKnowledgeGraphForArticle(articleId: number) {
  const result = await database.query<{ tags: string[]; category: string }>(
    "SELECT tags, category FROM articles WHERE id = $1",
    [articleId],
  );
  const article = result.rows[0];
  if (!article) return;
  const domains = article.tags.length ? article.tags : [article.category];
  for (const domain of domains) await refreshKnowledgeGraphDomain(domain);
}
