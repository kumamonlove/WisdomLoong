"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, PointerEvent, WheelEvent } from "react";
import { MathTitle } from "@/app/math-title";
import type {
  KnowledgeGraphArticle,
  KnowledgeGraphCanvasEdge,
  KnowledgeGraphCanvasNode,
  KnowledgeGraphData,
  KnowledgeGraphDomain,
  KnowledgeGraphMutation,
} from "@/lib/knowledge-graph";

const canvasWidth = 1_800;
const nodeWidth = 260;

function graphHref(domain: string) {
  return `/categories?domain=${encodeURIComponent(domain)}`;
}

export function KnowledgeGraphExplorer({
  domains,
  graph,
}: {
  domains: KnowledgeGraphDomain[];
  graph: KnowledgeGraphData;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const syncedGraphRef = useRef({ nodes: graph.nodes, edges: graph.edges });
  const dragRef = useRef<{
    articleId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const [nodes, setNodes] = useState(graph.nodes);
  const [edges, setEdges] = useState(graph.edges);
  const [selectedId, setSelectedId] = useState<number | null>(graph.nodes[0]?.articleId ?? null);
  const [connectingFrom, setConnectingFrom] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [noteDraft, setNoteDraft] = useState("");

  useEffect(() => {
    syncedGraphRef.current = { nodes: graph.nodes, edges: graph.edges };
    setNodes(graph.nodes);
    setEdges(graph.edges);
    setSelectedId(graph.nodes[0]?.articleId ?? null);
    setConnectingFrom(null);
    setMessage("");
  }, [graph]);

  useEffect(() => {
    if (saving) return;
    const refreshSharedCanvas = async () => {
      try {
        const response = await fetch(`/api/knowledge-graph?domain=${encodeURIComponent(graph.domain)}`, { cache: "no-store" });
        const data = await response.json() as { graph?: KnowledgeGraphData };
        if (!response.ok || !data.graph || dragRef.current) return;
        syncedGraphRef.current = { nodes: data.graph.nodes, edges: data.graph.edges };
        setNodes(data.graph.nodes);
        setEdges(data.graph.edges);
      } catch {
        // The local shared state remains usable and the next interval retries.
      }
    };
    const timer = window.setInterval(refreshSharedCanvas, 12_000);
    return () => window.clearInterval(timer);
  }, [graph.domain, saving]);

  const placedIds = useMemo(() => new Set(nodes.map((node) => node.articleId)), [nodes]);
  const waiting = useMemo(
    () => graph.articles.filter((article) => !placedIds.has(article.articleId)),
    [graph.articles, placedIds],
  );
  const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.articleId, node])), [nodes]);
  const selectedNode = selectedId === null ? null : nodeMap.get(selectedId) ?? null;
  const canvasHeight = Math.max(900, ...nodes.map((node) => node.y + 240));

  useEffect(() => {
    setNoteDraft(selectedNode?.note ?? "");
  }, [selectedNode?.articleId, selectedNode?.note]);

  async function mutate(body: KnowledgeGraphMutation) {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/knowledge-graph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json() as { error?: string; graph?: KnowledgeGraphData };
      if (!response.ok || !data.graph) throw new Error(data.error ?? "共享画板保存失败");
      syncedGraphRef.current = { nodes: data.graph.nodes, edges: data.graph.edges };
      setNodes(data.graph.nodes);
      setEdges(data.graph.edges);
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "共享画板保存失败");
      setNodes(syncedGraphRef.current.nodes);
      setEdges(syncedGraphRef.current.edges);
      return false;
    } finally {
      setSaving(false);
    }
  }

  function placeArticle(article: KnowledgeGraphArticle, x: number, y: number) {
    const nextNode: KnowledgeGraphCanvasNode = { ...article, x, y, note: "" };
    setNodes((current) => [...current.filter((node) => node.articleId !== article.articleId), nextNode]);
    setSelectedId(article.articleId);
    void mutate({ action: "place", domain: graph.domain, articleId: article.articleId, x, y });
  }

  function dropArticle(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const articleId = Number(event.dataTransfer.getData("application/x-wisdomloong-article"));
    const article = graph.articles.find((item) => item.articleId === articleId);
    const canvas = canvasRef.current;
    if (!article || !canvas || placedIds.has(articleId)) return;
    const bounds = canvas.getBoundingClientRect();
    const x = Math.max(24, Math.min(canvasWidth - nodeWidth - 24, event.clientX - bounds.left - nodeWidth / 2));
    const y = Math.max(24, Math.min(canvasHeight - 170, event.clientY - bounds.top - 40));
    placeArticle(article, Math.round(x), Math.round(y));
  }

  function startMoving(event: PointerEvent<HTMLElement>, node: KnowledgeGraphCanvasNode) {
    if ((event.target as HTMLElement).closest("button, a, textarea")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      articleId: node.articleId,
      startX: event.clientX,
      startY: event.clientY,
      originX: node.x,
      originY: node.y,
    };
    setSelectedId(node.articleId);
  }

  function moveNode(event: PointerEvent<HTMLElement>) {
    const dragging = dragRef.current;
    if (!dragging) return;
    const x = Math.max(0, Math.min(canvasWidth - nodeWidth, dragging.originX + event.clientX - dragging.startX));
    const y = Math.max(0, dragging.originY + event.clientY - dragging.startY);
    setNodes((current) => current.map((node) =>
      node.articleId === dragging.articleId ? { ...node, x: Math.round(x), y: Math.round(y) } : node
    ));
  }

  function finishMoving(event: PointerEvent<HTMLElement>) {
    const dragging = dragRef.current;
    if (!dragging) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    const node = nodes.find((item) => item.articleId === dragging.articleId);
    if (!node || (node.x === dragging.originX && node.y === dragging.originY)) return;
    void mutate({ action: "move", domain: graph.domain, articleId: node.articleId, x: node.x, y: node.y });
  }

  function connectTo(event: DragEvent<HTMLElement>, targetArticleId: number) {
    const sourceArticleId = Number(event.dataTransfer.getData("application/x-wisdomloong-graph-source"));
    if (!Number.isInteger(sourceArticleId)) return;
    event.preventDefault();
    event.stopPropagation();
    setConnectingFrom(null);
    if (sourceArticleId === targetArticleId) return;
    void mutate({ action: "connect", domain: graph.domain, sourceArticleId, targetArticleId });
  }

  function panCanvas(event: WheelEvent<HTMLDivElement>) {
    const viewport = event.currentTarget;
    const maxTop = viewport.scrollHeight - viewport.clientHeight;
    const maxLeft = viewport.scrollWidth - viewport.clientWidth;
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    const canMoveVertically = maxTop > 0 && (
      (event.deltaY < 0 && viewport.scrollTop > 0) ||
      (event.deltaY > 0 && viewport.scrollTop < maxTop)
    );
    if (canMoveVertically || maxLeft <= 0) return;
    const nextLeft = Math.max(0, Math.min(maxLeft, viewport.scrollLeft + event.deltaY));
    if (nextLeft === viewport.scrollLeft) return;
    event.preventDefault();
    viewport.scrollLeft = nextLeft;
  }

  return (
    <>
      <section className="graph-domain-picker" aria-label="知识图谱领域">
        {domains.map((domain) => (
          <a className={domain.domain === graph.domain ? "selected" : ""} href={graphHref(domain.domain)} key={domain.domain}>
            <span>{domain.domain}</span>
            <small>{domain.placedCount} / {domain.articleCount} 已放置</small>
          </a>
        ))}
      </section>

      <section className="manual-graph-intro">
        <div><span>共享人工画板</span><h2>{graph.domain}</h2></div>
        <p>把下方论文拖入画板；拖动节点调整位置，再从节点右侧圆点拖到另一节点建立思想继承关系。</p>
        <strong className={saving ? "saving" : ""}>{saving ? "正在保存…" : "所有修改对成员共享"}</strong>
        {message && <small role="alert">{message}</small>}
      </section>

      <section className="knowledge-tree-section manual-tree-section">
        <header>
          <div><span>领域画板</span><strong>{nodes.length} 个节点 · {edges.length} 条连接</strong></div>
          <p>滚轮纵向浏览；在不需要纵向移动时，滚轮会继续横向浏览。</p>
        </header>
        <div
          className="knowledge-tree-viewport manual-graph-viewport"
          onDragOver={(event) => event.preventDefault()}
          onDrop={dropArticle}
          onWheel={panCanvas}
        >
          <div className="manual-graph-canvas" ref={canvasRef} style={{ height: canvasHeight, width: canvasWidth }}>
            {nodes.length === 0 && (
              <div className="manual-canvas-empty"><span>空画板</span><strong>从下方拖入第一篇论文</strong><small>当前没有任何预置节点</small></div>
            )}
            <svg aria-hidden="true" height={canvasHeight} width={canvasWidth}>
              <defs>
                <marker id="manual-graph-arrow" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
                  <path d="M0,0 L8,4 L0,8 Z" />
                </marker>
              </defs>
              {edges.map((edge) => {
                const source = nodeMap.get(edge.sourceArticleId);
                const target = nodeMap.get(edge.targetArticleId);
                if (!source || !target) return null;
                const startX = source.x + nodeWidth;
                const startY = source.y + 68;
                const endX = target.x;
                const endY = target.y + 68;
                const bend = (startX + endX) / 2;
                return <path d={`M ${startX} ${startY} C ${bend} ${startY}, ${bend} ${endY}, ${endX} ${endY}`} key={edge.id} markerEnd="url(#manual-graph-arrow)" />;
              })}
            </svg>
            {edges.map((edge) => {
              const source = nodeMap.get(edge.sourceArticleId);
              const target = nodeMap.get(edge.targetArticleId);
              if (!source || !target) return null;
              return (
                <button
                  aria-label="删除这条连接"
                  className="manual-edge-delete"
                  key={`delete-${edge.id}`}
                  onClick={() => void mutate({ action: "disconnect", domain: graph.domain, edgeId: edge.id })}
                  style={{ left: (source.x + target.x + nodeWidth) / 2, top: (source.y + target.y) / 2 + 52 }}
                  title="删除连接"
                  type="button"
                >×</button>
              );
            })}
            {nodes.map((node) => (
              <article
                className={`manual-graph-node${selectedId === node.articleId ? " selected" : ""}${connectingFrom !== null && connectingFrom !== node.articleId ? " connect-target" : ""}`}
                key={node.articleId}
                onClick={() => setSelectedId(node.articleId)}
                onDragOver={(event) => {
                  if (connectingFrom !== null && connectingFrom !== node.articleId) event.preventDefault();
                }}
                onDrop={(event) => connectTo(event, node.articleId)}
                onPointerDown={(event) => startMoving(event, node)}
                onPointerMove={moveNode}
                onPointerUp={finishMoving}
                style={{ left: node.x, top: node.y }}
              >
                <header><time>{node.publishedAt?.slice(0, 7) ?? "日期待补"}</time><span>{node.publisher === "机构待补充" || node.publisher.toLocaleLowerCase() === "arxiv" ? "" : node.publisher}</span></header>
                <strong><MathTitle title={node.title} /></strong>
                {node.note && <p>{node.note}</p>}
                <button
                  aria-label="从画板移除"
                  className="manual-node-remove"
                  onClick={() => {
                    setSelectedId(null);
                    void mutate({ action: "remove", domain: graph.domain, articleId: node.articleId });
                  }}
                  title="移回待放区"
                  type="button"
                >×</button>
                <button
                  aria-label="拖动连接到另一节点"
                  className="manual-node-connector"
                  draggable
                  onDragEnd={() => setConnectingFrom(null)}
                  onDragStart={(event) => {
                    event.stopPropagation();
                    event.dataTransfer.effectAllowed = "link";
                    event.dataTransfer.setData("application/x-wisdomloong-graph-source", String(node.articleId));
                    setConnectingFrom(node.articleId);
                  }}
                  title="拖到另一节点建立连接"
                  type="button"
                ><i /></button>
              </article>
            ))}
          </div>
        </div>

        {selectedNode && (
          <div className="manual-node-editor">
            <div><span>节点说明</span><strong><MathTitle title={selectedNode.title} /></strong></div>
            <textarea maxLength={500} onChange={(event) => setNoteDraft(event.target.value)} placeholder="人工补充这篇论文在本领域的贡献…" value={noteDraft} />
            <button disabled={saving || noteDraft.trim() === selectedNode.note} onClick={() => void mutate({ action: "note", domain: graph.domain, articleId: selectedNode.articleId, note: noteDraft })} type="button">保存说明</button>
            <a href={`/reviews/new?article=${selectedNode.articleId}`}>阅读论文 →</a>
          </div>
        )}
      </section>

      <section className="graph-waiting-section">
        <header><div><span>等待放置</span><strong>{waiting.length} 篇论文</strong></div><p>按住整张卡片，拖到上方画板中的合适位置。</p></header>
        {waiting.length > 0 ? (
          <div className="graph-waiting-cards">
            {waiting.map((article) => (
              <article
                draggable
                key={article.articleId}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("application/x-wisdomloong-article", String(article.articleId));
                }}
              >
                <time>{article.publishedAt?.slice(0, 7) ?? "日期待补"}</time>
                <strong><MathTitle title={article.title} /></strong>
                <span>{article.publisher === "机构待补充" || article.publisher.toLocaleLowerCase() === "arxiv" ? "" : article.publisher}</span>
                <p>{article.abstract || "摘要正在补齐。"}</p>
                <small>拖入画板 ＋</small>
              </article>
            ))}
          </div>
        ) : <p className="graph-waiting-empty">这个领域的论文都已放入画板。</p>}
      </section>
    </>
  );
}
