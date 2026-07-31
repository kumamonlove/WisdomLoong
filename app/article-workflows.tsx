"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type FormEvent } from "react";
import {
  articleCategories,
  normalizeTags,
  type ArticleCategory,
} from "@/lib/knowledge-types";
import type { ReaderArticle } from "@/lib/knowledge";

type ArxivResult = {
  title: string;
  abstract: string;
  authors: string[];
  publishedAt: string;
  publisher: string;
  sourceUrl: string;
  externalId: string;
};

async function responseJson(response: Response) {
  const data = (await response.json()) as { error?: string; [key: string]: unknown };
  if (!response.ok) {
    throw new Error(data.error ?? "操作失败，请稍后重试");
  }
  return data;
}

function ArxivLookup({
  addToReadingList,
  onImported,
}: {
  addToReadingList: boolean;
  onImported?: (article: ReaderArticle) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ArxivResult[]>([]);
  const [category, setCategory] = useState<ArticleCategory>("Ego第一人称");
  const [publisher, setPublisher] = useState("");
  const [tags, setTags] = useState<string[]>(["Ego第一人称"]);
  const [tagDraft, setTagDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function search(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/arxiv?title=${encodeURIComponent(query)}`);
      const data = await responseJson(response);
      const nextResults = data.results as ArxivResult[];
      setResults(nextResults);
      if (nextResults.length === 0) {
        setMessage("arXiv 没有找到匹配文章，请尝试更完整或更准确的英文标题。");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "检索失败");
    } finally {
      setBusy(false);
    }
  }

  async function importArticle(article: ArxivResult) {
    setImportingId(article.externalId);
    setMessage("");
    try {
      const response = await fetch("/api/articles/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...article,
          publisher: publisher.trim() || article.publisher,
          category,
          tags,
          addToReadingList,
        }),
      });
      const data = await responseJson(response);
      const articleId = Number(data.articleId);
      setMessage(addToReadingList ? "已加入你的待读文章。" : "文章信息已导入，可以开始评论。");
      onImported?.({
        id: articleId,
        title: article.title,
        abstract: article.abstract,
        authors: article.authors,
        publisher: publisher.trim() || article.publisher,
        category,
        tags,
        publishedAt: article.publishedAt,
        sourceUrl: article.sourceUrl,
      });
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导入失败");
    } finally {
      setImportingId(null);
    }
  }

  return (
    <div className="lookup-panel">
      <form className="lookup-form" onSubmit={search}>
        <label>
          文章名称
          <div>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="输入 arXiv 论文标题"
              required
              type="search"
              value={query}
            />
            <button disabled={busy} type="submit">
              {busy ? "正在连接…" : "自动查找"}
            </button>
          </div>
        </label>
        <label>
          知识分类
          <select
            onChange={(event) => {
              const nextCategory = event.target.value as ArticleCategory;
              setCategory(nextCategory);
              setTags((current) => normalizeTags([nextCategory, ...current]));
            }}
            value={category}
          >
            {articleCategories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          发布机构
          <input
            onChange={(event) => setPublisher(event.target.value)}
            placeholder="如 Physical Intelligence（不是 arXiv）"
            value={publisher}
          />
        </label>
      </form>
      <div className="tag-editor">
        <span>文章标签（可添加多个）</span>
        <div className="tag-editor-row">
          <div className="editable-tags">
            {tags.map((tag) => (
              <button
                aria-label={`移除标签 ${tag}`}
                key={tag}
                onClick={() => setTags((current) => current.filter((item) => item !== tag))}
                type="button"
              >
                {tag} ×
              </button>
            ))}
          </div>
          <input
            onChange={(event) => setTagDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== ",") return;
              event.preventDefault();
              setTags((current) => normalizeTags([...current, tagDraft]));
              setTagDraft("");
            }}
            placeholder="输入标签后按 Enter"
            value={tagDraft}
          />
          <button
            onClick={() => {
              setTags((current) => normalizeTags([...current, tagDraft]));
              setTagDraft("");
            }}
            type="button"
          >
            添加
          </button>
        </div>
      </div>

      {message && <p className="workflow-message" role="status">{message}</p>}

      {results.length > 0 && (
        <div className="lookup-results">
          {results.map((article) => (
            <article key={article.externalId}>
              <div>
                <span>{article.externalId}</span>
                <span>{publisher.trim() || article.publisher} · {article.publishedAt}</span>
              </div>
              <h3>{article.title}</h3>
              <p className="lookup-authors">{article.authors.join(", ")}</p>
              <p className="lookup-abstract">{article.abstract}</p>
              <footer>
                <a href={article.sourceUrl} rel="noreferrer" target="_blank">
                  查看 arXiv ↗
                </a>
                <button
                  disabled={importingId !== null}
                  onClick={() => importArticle(article)}
                  type="button"
                >
                  {importingId === article.externalId
                    ? "正在导入…"
                    : addToReadingList
                      ? "加入待读"
                      : "选择并评论"}
                </button>
              </footer>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export function ReadingListImporter() {
  return <ArxivLookup addToReadingList />;
}

type Capture = { dataUrl: string; note: string };
type ReadingNote = { page: number; content: string };

function pdfUrl(sourceUrl: string, page: number, zoom: number) {
  const base = sourceUrl.includes("arxiv.org/abs/")
    ? `${sourceUrl.replace("/abs/", "/pdf/")}.pdf`
    : sourceUrl;
  return `${base.split("#")[0]}#page=${page}&zoom=${zoom}`;
}

export function ReviewComposer({
  articles,
  initialArticleId,
}: {
  articles: ReaderArticle[];
  initialArticleId?: number;
}) {
  const router = useRouter();
  const [availableArticles, setAvailableArticles] = useState(articles);
  const [articleId, setArticleId] = useState(initialArticleId ?? articles[0]?.id ?? 0);
  const [articleSearch, setArticleSearch] = useState("");
  const [rating, setRating] = useState(4);
  const [mustRead, setMustRead] = useState(false);
  const [reviewType, setReviewType] = useState<"short" | "long">("long");
  const [content, setContent] = useState("");
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [progress, setProgress] = useState(0);
  const [focusMode, setFocusMode] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [notes, setNotes] = useState<ReadingNote[]>([]);
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [message, setMessage] = useState("");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const selectedArticle = availableArticles.find((item) => item.id === articleId);
  const filteredArticles = useMemo(() => {
    const query = articleSearch.trim().toLocaleLowerCase();
    if (!query) return availableArticles;
    return availableArticles.filter((article) =>
      [article.title, article.publisher, article.authors.join(" "), article.tags.join(" ")]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query),
    );
  }, [articleSearch, availableArticles]);

  function selectArticle(id: number) {
    setArticleId(id);
    setPage(1);
    setProgress(0);
    setNotes([]);
    setCaptures([]);
  }

  function useImportedArticle(article: ReaderArticle) {
    setAvailableArticles((current) => [
      article,
      ...current.filter((item) => item.id !== article.id),
    ]);
    selectArticle(article.id);
  }

  async function addTag() {
    if (!selectedArticle || !tagDraft.trim()) return;
    const nextTags = normalizeTags([...selectedArticle.tags, tagDraft]);
    try {
      await responseJson(await fetch(`/api/articles/${selectedArticle.id}/tags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: nextTags }),
      }));
      setAvailableArticles((current) => current.map((article) =>
        article.id === selectedArticle.id ? { ...article, tags: nextTags } : article
      ));
      setTagDraft("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "标签保存失败");
    }
  }

  async function captureScreen() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setMessage("当前浏览器不支持屏幕截图，请使用最新版 Chrome 或 Edge。");
      return;
    }
    setCapturing(true);
    setMessage("请选择当前论文标签页或窗口，画面只会在本次截图时读取。");
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const video = document.createElement("video");
      video.srcObject = stream;
      await video.play();
      await new Promise((resolve) => setTimeout(resolve, 180));
      const scale = Math.min(1, 1440 / video.videoWidth);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      setCaptures((current) => [
        ...current,
        { dataUrl: canvas.toDataURL("image/jpeg", 0.82), note: `第 ${page} 页` },
      ].slice(0, 4));
      setMessage("截图已附在评论中，可补充图片说明。");
    } catch (error) {
      if ((error as Error).name !== "NotAllowedError") {
        setMessage("截图失败，请重试。");
      }
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
      setCapturing(false);
    }
  }

  async function submitReview(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const readingNotes = notes.length
      ? `\n\n阅读笔记\n${notes.map((note) => `P.${note.page}　${note.content}`).join("\n")}`
      : "";
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articleId,
          rating,
          mustRead,
          reviewType,
          content: `${content.trim()}${readingNotes}`,
          attachments: captures,
        }),
      });
      await responseJson(response);
      setMessage("评论已发布。文章已从你的待读清单中移除。");
      setContent("");
      setNotes([]);
      setCaptures([]);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "评论保存失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`reader-workspace${focusMode ? " focus-mode" : ""}`}>
      <aside className="article-library">
        <div className="library-heading">
          <span>文章库</span>
          <strong>{availableArticles.length}</strong>
        </div>
        <input
          aria-label="搜索已有文章"
          onChange={(event) => setArticleSearch(event.target.value)}
          placeholder="搜索标题、作者、机构或标签…"
          type="search"
          value={articleSearch}
        />
        <div className="article-search-results">
          {filteredArticles.map((article) => (
            <button
              className={article.id === articleId ? "selected" : ""}
              key={article.id}
              onClick={() => selectArticle(article.id)}
              type="button"
            >
              <span>{article.publisher}</span>
              <strong>{article.title}</strong>
              <small>{article.tags.join(" · ")}</small>
            </button>
          ))}
          {filteredArticles.length === 0 && <p>没有匹配文章</p>}
        </div>
        <details className="reader-import">
          <summary>＋ 从 arXiv 导入新文章</summary>
          <ArxivLookup addToReadingList={false} onImported={useImportedArticle} />
        </details>
      </aside>

      <section className="paper-reader">
        {selectedArticle ? (
          <>
            <header className="reader-titlebar">
              <div>
                <span>{selectedArticle.publisher}</span>
                <h2>{selectedArticle.title}</h2>
                <p>{selectedArticle.authors.join(", ")}</p>
              </div>
              <a href={selectedArticle.sourceUrl} rel="noreferrer" target="_blank">原文 ↗</a>
            </header>
            <div className="reader-tags">
              {selectedArticle.tags.map((tag) => <span key={tag}>{tag}</span>)}
              <input
                onChange={(event) => setTagDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void addTag();
                  }
                }}
                placeholder="+ 添加标签"
                value={tagDraft}
              />
              <button onClick={() => void addTag()} type="button">添加</button>
            </div>
            <div className="reader-toolbar">
              <div>
                <button disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} type="button">←</button>
                <label>第 <input min="1" onChange={(event) => setPage(Math.max(1, Number(event.target.value)))} type="number" value={page} /> 页</label>
                <button onClick={() => setPage((value) => value + 1)} type="button">→</button>
              </div>
              <div>
                <button onClick={() => setZoom((value) => Math.max(60, value - 10))} type="button">−</button>
                <span>{zoom}%</span>
                <button onClick={() => setZoom((value) => Math.min(200, value + 10))} type="button">＋</button>
              </div>
              <button onClick={() => setFocusMode((value) => !value)} type="button">
                {focusMode ? "退出专注" : "专注阅读"}
              </button>
              <button className="capture-button" disabled={capturing} onClick={captureScreen} type="button">
                {capturing ? "正在截图…" : "▣ 截图引用"}
              </button>
            </div>
            <iframe
              key={`${articleId}-${page}-${zoom}`}
              ref={iframeRef}
              src={pdfUrl(selectedArticle.sourceUrl, page, zoom)}
              title={selectedArticle.title}
            />
            <div className="reading-progress">
              <label>
                阅读进度 <strong>{progress}%</strong>
                <input max="100" min="0" onChange={(event) => setProgress(Number(event.target.value))} type="range" value={progress} />
              </label>
            </div>
          </>
        ) : (
          <div className="empty"><h3>先选择一篇文章</h3><p>也可以从 arXiv 导入新文章。</p></div>
        )}
      </section>

      <aside className="reader-notebook">
        <div className="notebook-heading">
          <span>阅读笔记</span>
          <small>自动带入评论</small>
        </div>
        <textarea
          onChange={(event) => setNoteDraft(event.target.value)}
          placeholder={`记录第 ${page} 页的重要观点…`}
          rows={4}
          value={noteDraft}
        />
        <button
          disabled={!noteDraft.trim()}
          onClick={() => {
            setNotes((current) => [...current, { page, content: noteDraft.trim() }]);
            setNoteDraft("");
          }}
          type="button"
        >
          保存页码笔记
        </button>
        <div className="saved-notes">
          {notes.map((note, index) => (
            <button key={`${note.page}-${index}`} onClick={() => setPage(note.page)} type="button">
              <strong>P.{note.page}</strong><span>{note.content}</span>
            </button>
          ))}
        </div>
        {captures.length > 0 && (
          <div className="capture-list">
            {captures.map((capture, index) => (
              <div key={capture.dataUrl.slice(-24)}>
                <img alt={`论文截图 ${index + 1}`} src={capture.dataUrl} />
                <input
                  aria-label={`截图 ${index + 1} 说明`}
                  onChange={(event) => setCaptures((current) => current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, note: event.target.value } : item
                  ))}
                  placeholder="这张图说明了什么？"
                  value={capture.note}
                />
                <button onClick={() => setCaptures((current) => current.filter((_, itemIndex) => itemIndex !== index))} type="button">移除</button>
              </div>
            ))}
          </div>
        )}

        <form className="review-form reader-review-form" onSubmit={submitReview}>
          <h2>留下评论</h2>
          <div className="review-type-switch">
            <button className={reviewType === "short" ? "selected" : ""} onClick={() => setReviewType("short")} type="button">
              <strong>短评</strong><span>一句话判断</span>
            </button>
            <button className={reviewType === "long" ? "selected" : ""} onClick={() => setReviewType("long")} type="button">
              <strong>长评</strong><span>完整解读</span>
            </button>
          </div>
          <div className={`star-rating rating-${rating}`}>
            <span>我的评分</span>
            <div>
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  aria-label={`${value} 星`}
                  className={value <= rating ? "filled" : ""}
                  key={value}
                  onClick={() => setRating(value)}
                  type="button"
                >★</button>
              ))}
              <strong>{rating}.0</strong>
            </div>
          </div>
          <label className={`must-read-toggle${mustRead ? " selected" : ""}`}>
            <input checked={mustRead} onChange={(event) => setMustRead(event.target.checked)} type="checkbox" />
            <span aria-hidden="true">✦</span>
            <div><strong>必读</strong><small>向团队重点推荐这篇文章</small></div>
          </label>
          <label>
            {reviewType === "short" ? "一句话短评" : "长评 / 解读"}
            <textarea
              maxLength={reviewType === "short" ? 80 : undefined}
              minLength={reviewType === "long" ? 80 : 2}
              onChange={(event) => setContent(event.target.value)}
              placeholder={reviewType === "short" ? "例如：VLA 开山之作" : "梳理论文问题、方法、证据、局限，以及它为什么值得团队关注…"}
              required
              rows={reviewType === "short" ? 3 : 12}
              value={content}
            />
            <small>{content.length}{reviewType === "short" ? " / 80 字" : " 字 · 长评至少 80 字"}</small>
          </label>
          {message && <p className="workflow-message" role="status">{message}</p>}
          <button disabled={busy || articleId === 0} type="submit">
            {busy ? "正在发布…" : `发布${reviewType === "short" ? "短评" : "长评"}`}
          </button>
        </form>
      </aside>
    </div>
  );
}
