"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MathTitle } from "@/app/math-title";
import type {
  KnowledgeGraphData,
  KnowledgeGraphDomain,
  KnowledgeGraphNode,
} from "@/lib/knowledge-graph";

function graphHref(domain: string) {
  return `/categories?domain=${encodeURIComponent(domain)}`;
}

function nodeLayout(nodes: KnowledgeGraphNode[]) {
  const nodeMap = new Map(nodes.map((node) => [node.articleId, node]));
  const depths = new Map<number, number>();
  const visiting = new Set<number>();
  const depthOf = (node: KnowledgeGraphNode): number => {
    const cached = depths.get(node.articleId);
    if (cached !== undefined) return cached;
    if (visiting.has(node.articleId)) return 0;
    visiting.add(node.articleId);
    const parents = node.parentArticleIds.map((id) => nodeMap.get(id)).filter(Boolean) as KnowledgeGraphNode[];
    const depth = parents.length ? Math.max(...parents.map(depthOf)) + 1 : 0;
    visiting.delete(node.articleId);
    depths.set(node.articleId, depth);
    return depth;
  };
  nodes.forEach(depthOf);
  const groups = new Map<number, KnowledgeGraphNode[]>();
  for (const node of nodes) {
    const depth = depths.get(node.articleId) ?? 0;
    groups.set(depth, [...(groups.get(depth) ?? []), node]);
  }
  const maxDepth = Math.max(0, ...groups.keys());
  const maxRows = Math.max(1, ...[...groups.values()].map((items) => items.length));
  const width = Math.max(920, (maxDepth + 1) * 300 + 100);
  const height = Math.max(460, maxRows * 190 + 100);
  const positions = new Map<number, { x: number; y: number }>();
  for (const [depth, items] of groups) {
    const usedHeight = items.length * 190;
    const top = Math.max(50, (height - usedHeight) / 2 + 15);
    items.forEach((node, index) => positions.set(node.articleId, {
      x: 50 + depth * 300,
      y: top + index * 190,
    }));
  }
  return { width, height, positions, nodeMap };
}

function relatedNodes(activeId: number | null, nodes: KnowledgeGraphNode[]) {
  if (!activeId) return new Set<number>();
  const nodeMap = new Map(nodes.map((node) => [node.articleId, node]));
  const children = new Map<number, number[]>();
  for (const node of nodes) {
    for (const parent of node.parentArticleIds) children.set(parent, [...(children.get(parent) ?? []), node.articleId]);
  }
  const related = new Set<number>([activeId]);
  const walkParents = (id: number) => {
    for (const parent of nodeMap.get(id)?.parentArticleIds ?? []) {
      if (related.has(parent)) continue;
      related.add(parent);
      walkParents(parent);
    }
  };
  const walkChildren = (id: number) => {
    for (const child of children.get(id) ?? []) {
      if (related.has(child)) continue;
      related.add(child);
      walkChildren(child);
    }
  };
  walkParents(activeId);
  walkChildren(activeId);
  return related;
}

export function KnowledgeGraphExplorer({
  domains,
  graph,
}: {
  domains: KnowledgeGraphDomain[];
  graph: KnowledgeGraphData;
}) {
  const router = useRouter();
  const [activeId, setActiveId] = useState<number | null>(graph.nodes[0]?.articleId ?? null);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const layout = useMemo(() => nodeLayout(graph.nodes), [graph.nodes]);
  const related = useMemo(() => relatedNodes(activeId, graph.nodes), [activeId, graph.nodes]);
  const activeNode = graph.nodes.find((node) => node.articleId === activeId) ?? null;

  async function refreshGraph(automatic = false) {
    if (refreshing) return;
    setRefreshing(true);
    if (!automatic) setMessage("");
    try {
      const response = await fetch("/api/knowledge-graph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: graph.domain }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "图谱更新失败");
      setMessage("领域图谱已根据当前文章重新整理。");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "图谱更新失败");
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    const pending = domains.filter((domain) =>
      domain.status !== "ready" || domain.analyzedCount < domain.articleCount
    );
    if (pending.length === 0) return;

    void (async () => {
      let refreshed = false;
      for (const domain of pending) {
        if (cancelled) break;
        const key = `wisdomloong-graph-refresh-${domain.domain}-${domain.articleCount}`;
        if (window.sessionStorage.getItem(key)) continue;
        window.sessionStorage.setItem(key, "1");
        if (domain.domain === graph.domain) setRefreshing(true);
        try {
          const response = await fetch("/api/knowledge-graph", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ domain: domain.domain }),
          });
          if (response.ok) refreshed = true;
        } catch {
          // A failed domain remains pending and is retried in a later session.
        } finally {
          if (!cancelled && domain.domain === graph.domain) setRefreshing(false);
        }
      }
      if (!cancelled && refreshed) router.refresh();
    })();

    return () => { cancelled = true; };
  }, [domains, graph.domain, router]);

  return (
    <>
      <section className="graph-domain-picker" aria-label="知识图谱领域">
        {domains.map((domain) => (
          <a className={domain.domain === graph.domain ? "selected" : ""} href={graphHref(domain.domain)} key={domain.domain}>
            <span>{domain.domain}</span>
            <small>{domain.articleCount} 篇 · {domain.analyzedCount === domain.articleCount ? "已整理" : "待更新"}</small>
          </a>
        ))}
      </section>

      <section className="graph-narrative">
        <div>
          <span>领域发展叙事</span>
          <h2>{graph.domain}</h2>
        </div>
        <p>{graph.narrative || "AI 正在依据论文时间、摘要与全文证据梳理该领域的发展主线。"}</p>
        <button disabled={refreshing} onClick={() => void refreshGraph()} type="button">
          {refreshing ? "AI 正在重建图谱…" : "重新整理图谱"}
        </button>
        {message && <small role="status">{message}</small>}
      </section>

      <section className="knowledge-tree-section">
        <header>
          <div><span>思想继承树</span><strong>{graph.nodes.length} 个研究节点</strong></div>
          <p>点击节点可聚焦其前驱与后续分支；横向滚动查看完整技术路径。</p>
        </header>
        <div className="knowledge-tree-viewport">
          <div className="knowledge-tree-canvas" style={{ width: layout.width, height: layout.height }}>
            <svg aria-hidden="true" height={layout.height} width={layout.width}>
              <defs>
                <marker id="graph-arrow" markerHeight="7" markerWidth="7" orient="auto" refX="6" refY="3.5">
                  <path d="M0,0 L7,3.5 L0,7 Z" />
                </marker>
              </defs>
              {graph.nodes.flatMap((node) => node.parentArticleIds.map((parentId) => {
                const parent = layout.positions.get(parentId);
                const child = layout.positions.get(node.articleId);
                if (!parent || !child) return null;
                const highlighted = !activeId || (related.has(parentId) && related.has(node.articleId));
                const startX = parent.x + 240;
                const startY = parent.y + 64;
                const endX = child.x;
                const endY = child.y + 64;
                const bend = (startX + endX) / 2;
                return (
                  <path
                    className={highlighted ? "related" : "dimmed"}
                    d={`M ${startX} ${startY} C ${bend} ${startY}, ${bend} ${endY}, ${endX} ${endY}`}
                    key={`${parentId}-${node.articleId}`}
                    markerEnd="url(#graph-arrow)"
                  />
                );
              }))}
            </svg>
            {graph.nodes.map((node) => {
              const position = layout.positions.get(node.articleId)!;
              const dimmed = activeId !== null && !related.has(node.articleId);
              return (
                <button
                  className={`${activeId === node.articleId ? "active" : ""}${dimmed ? " dimmed" : ""}`}
                  key={node.articleId}
                  onClick={() => setActiveId(node.articleId)}
                  style={{ left: position.x, top: position.y }}
                  type="button"
                >
                  <time>{node.publishedAt?.slice(0, 7) ?? "日期待补"}</time>
                  <strong><MathTitle title={node.title} /></strong>
                  <span>{node.contribution}</span>
                </button>
              );
            })}
          </div>
        </div>
        {activeNode && (
          <article className="graph-node-detail">
            <div>
              <span>{activeNode.publishedAt ?? "日期待补"}</span>
              <h3><MathTitle title={activeNode.title} /></h3>
              <p>
                {activeNode.publisher !== "机构待补充" && activeNode.publisher.toLocaleLowerCase() !== "arxiv"
                  ? activeNode.publisher
                  : ""}
              </p>
            </div>
            <dl>
              <div><dt>领域贡献</dt><dd>{activeNode.contribution}</dd></div>
              <div><dt>继承关系</dt><dd>{activeNode.lineageReason || "该节点目前作为独立根节点。"}</dd></div>
              <div><dt>分析证据</dt><dd>{activeNode.analysisSource === "fulltext" ? "论文全文" : activeNode.analysisSource === "abstract" ? "论文摘要" : "文章标题"}</dd></div>
            </dl>
            <a href={`/reviews/new?article=${activeNode.articleId}`}>打开文章阅读器 →</a>
          </article>
        )}
      </section>
    </>
  );
}
