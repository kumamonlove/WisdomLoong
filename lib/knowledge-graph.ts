import type { PoolClient } from "pg";
import { database } from "@/lib/db";

export type KnowledgeGraphDomain = {
  domain: string;
  articleCount: number;
  placedCount: number;
};

export type KnowledgeGraphArticle = {
  articleId: number;
  title: string;
  publishedAt: string | null;
  publisher: string;
  abstract: string;
  isRead: boolean;
};

export type KnowledgeGraphCanvasNode = KnowledgeGraphArticle & {
  x: number;
  y: number;
  note: string;
};

export type KnowledgeGraphCanvasEdge = {
  id: number;
  sourceArticleId: number;
  targetArticleId: number;
};

export type KnowledgeGraphData = {
  domain: string;
  articleCount: number;
  placedCount: number;
  articles: KnowledgeGraphArticle[];
  nodes: KnowledgeGraphCanvasNode[];
  edges: KnowledgeGraphCanvasEdge[];
};

export type KnowledgeGraphMutation =
  | { action: "place"; domain: string; articleId: number; x: number; y: number }
  | { action: "move"; domain: string; articleId: number; x: number; y: number }
  | { action: "remove"; domain: string; articleId: number }
  | { action: "connect"; domain: string; sourceArticleId: number; targetArticleId: number }
  | { action: "disconnect"; domain: string; edgeId: number }
  | { action: "note"; domain: string; articleId: number; note: string };

function normalizeDomain(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 24) : "";
}

function normalizeCoordinate(value: unknown) {
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? Math.max(0, Math.min(7_500, Math.round(coordinate))) : null;
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
     ), placed AS (
       SELECT domain, COUNT(*)::int AS "placedCount"
       FROM knowledge_graph_canvas_nodes
       GROUP BY domain
     )
     SELECT domain_articles.domain, domain_articles."articleCount",
            COALESCE(placed."placedCount", 0)::int AS "placedCount"
     FROM domain_articles
     LEFT JOIN placed USING (domain)
     ORDER BY domain_articles."articleCount" DESC, domain_articles.domain`,
  );
  return result.rows;
}

export async function getKnowledgeGraph(domain: string, userId: number): Promise<KnowledgeGraphData> {
  const [articles, nodes, edges] = await Promise.all([
    database.query<KnowledgeGraphArticle>(
      `SELECT id AS "articleId", title, published_at::text AS "publishedAt", publisher,
              LEFT(COALESCE(NULLIF(abstract_zh, ''), abstract), 360) AS abstract,
              EXISTS (
                SELECT 1 FROM article_reads
                WHERE article_reads.user_id = $2 AND article_reads.article_id = articles.id
              ) AS "isRead"
       FROM articles
       WHERE $1 = ANY(CASE WHEN CARDINALITY(tags) > 0 THEN tags ELSE ARRAY[category] END)
       ORDER BY published_at ASC NULLS LAST, created_at ASC, id ASC`,
      [domain, userId],
    ),
    database.query<KnowledgeGraphCanvasNode>(
      `SELECT articles.id AS "articleId", articles.title,
              articles.published_at::text AS "publishedAt", articles.publisher,
              LEFT(COALESCE(NULLIF(articles.abstract_zh, ''), articles.abstract), 360) AS abstract,
              canvas.position_x::int AS x, canvas.position_y::int AS y, canvas.note,
              EXISTS (
                SELECT 1 FROM article_reads
                WHERE article_reads.user_id = $2 AND article_reads.article_id = articles.id
              ) AS "isRead"
       FROM knowledge_graph_canvas_nodes canvas
       JOIN articles ON articles.id = canvas.article_id
       WHERE canvas.domain = $1
       ORDER BY canvas.updated_at ASC`,
      [domain, userId],
    ),
    database.query<KnowledgeGraphCanvasEdge>(
      `SELECT id, source_article_id AS "sourceArticleId", target_article_id AS "targetArticleId"
       FROM knowledge_graph_canvas_edges
       WHERE domain = $1
       ORDER BY id`,
      [domain],
    ),
  ]);
  return {
    domain,
    articleCount: articles.rows.length,
    placedCount: nodes.rows.length,
    articles: articles.rows,
    nodes: nodes.rows,
    edges: edges.rows,
  };
}

async function articleBelongsToDomain(client: PoolClient, articleId: number, domain: string) {
  const result = await client.query(
    `SELECT 1 FROM articles
     WHERE id = $1
       AND $2 = ANY(CASE WHEN CARDINALITY(tags) > 0 THEN tags ELSE ARRAY[category] END)`,
    [articleId, domain],
  );
  return Boolean(result.rowCount);
}

export async function mutateKnowledgeGraph(raw: KnowledgeGraphMutation, userId: number) {
  const domain = normalizeDomain(raw.domain);
  if (!domain || domain === "全部") throw new Error("请选择有效的知识领域");
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    if (raw.action === "place" || raw.action === "move") {
      const articleId = Number(raw.articleId);
      const x = normalizeCoordinate(raw.x);
      const y = normalizeCoordinate(raw.y);
      if (!Number.isInteger(articleId) || x === null || y === null) throw new Error("节点位置无效");
      if (!await articleBelongsToDomain(client, articleId, domain)) throw new Error("文章不属于该领域");
      if (raw.action === "place") {
        await client.query(
          `INSERT INTO knowledge_graph_canvas_nodes
             (domain, article_id, position_x, position_y, updated_by, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (domain, article_id) DO UPDATE
           SET position_x = EXCLUDED.position_x, position_y = EXCLUDED.position_y,
               updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
          [domain, articleId, x, y, userId],
        );
      } else {
        const result = await client.query(
          `UPDATE knowledge_graph_canvas_nodes
           SET position_x = $3, position_y = $4, updated_by = $5, updated_at = NOW()
           WHERE domain = $1 AND article_id = $2`,
          [domain, articleId, x, y, userId],
        );
        if (!result.rowCount) throw new Error("节点尚未放入画板");
      }
    } else if (raw.action === "remove") {
      await client.query(
        "DELETE FROM knowledge_graph_canvas_nodes WHERE domain = $1 AND article_id = $2",
        [domain, Number(raw.articleId)],
      );
    } else if (raw.action === "note") {
      const note = typeof raw.note === "string" ? raw.note.trim().slice(0, 500) : "";
      const result = await client.query(
        `UPDATE knowledge_graph_canvas_nodes
         SET note = $3, updated_by = $4, updated_at = NOW()
         WHERE domain = $1 AND article_id = $2`,
        [domain, Number(raw.articleId), note, userId],
      );
      if (!result.rowCount) throw new Error("节点尚未放入画板");
    } else if (raw.action === "connect") {
      const source = Number(raw.sourceArticleId);
      const target = Number(raw.targetArticleId);
      if (!Number.isInteger(source) || !Number.isInteger(target) || source === target) {
        throw new Error("请选择两个不同的节点");
      }
      const nodes = await client.query<{ article_id: number }>(
        `SELECT article_id FROM knowledge_graph_canvas_nodes
         WHERE domain = $1 AND article_id = ANY($2::integer[])`,
        [domain, [source, target]],
      );
      if (nodes.rowCount !== 2) throw new Error("请先把两篇文章都放入画板");
      const cycle = await client.query(
        `WITH RECURSIVE descendants(article_id) AS (
           SELECT $3::integer
           UNION
           SELECT edges.target_article_id
           FROM knowledge_graph_canvas_edges edges
           JOIN descendants ON descendants.article_id = edges.source_article_id
           WHERE edges.domain = $1
         )
         SELECT 1 FROM descendants WHERE article_id = $2 LIMIT 1`,
        [domain, source, target],
      );
      if (cycle.rowCount) throw new Error("这条连线会形成循环，无法保存");
      await client.query(
        `INSERT INTO knowledge_graph_canvas_edges
           (domain, source_article_id, target_article_id, created_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (domain, source_article_id, target_article_id) DO NOTHING`,
        [domain, source, target, userId],
      );
    } else if (raw.action === "disconnect") {
      await client.query(
        "DELETE FROM knowledge_graph_canvas_edges WHERE id = $1 AND domain = $2",
        [Number(raw.edgeId), domain],
      );
    } else {
      throw new Error("不支持的画板操作");
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
