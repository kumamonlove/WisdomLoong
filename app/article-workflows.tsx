"use client";

import { useRouter } from "next/navigation";
import {
  useMemo,
  useRef,
  useState,
  useEffect,
  useCallback,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { normalizeTags } from "@/lib/knowledge-types";
import type { ReaderArticle } from "@/lib/knowledge";
import { ReviewLikeButton } from "@/app/review-actions";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";

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

function useExistingTags() {
  const [existingTags, setExistingTags] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    fetch("/api/articles/tags")
      .then(responseJson)
      .then((data) => {
        if (active) setExistingTags(data.tags as string[]);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  return existingTags;
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
  const [publisher, setPublisher] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const existingTags = useExistingTags();

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
    if (tags.length === 0) {
      setMessage("请至少添加一个文章标签。");
      return;
    }
    setImportingId(article.externalId);
    setMessage("");
    try {
      const response = await fetch("/api/articles/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...article,
          publisher: publisher.trim() || article.publisher,
          tags,
          addToReadingList,
        }),
      });
      const data = await responseJson(response);
      const articleId = Number(data.articleId);
      setMessage(addToReadingList ? "已推荐给团队，并加入所有未读成员的待读。" : "文章已推荐，可以开始阅读。");
      onImported?.({
        id: articleId,
        title: article.title,
        abstract: article.abstract,
        authors: article.authors,
        publisher: publisher.trim() || article.publisher,
        category: "Ego第一人称",
        tags,
        publishedAt: article.publishedAt,
        sourceUrl: article.sourceUrl,
        lastReadPage: null,
        ownReview: null,
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
          发布机构（选填）
          <input
            onChange={(event) => setPublisher(event.target.value)}
            value={publisher}
          />
        </label>
      </form>
      <div className="tag-editor">
        <span>文章标签（至少 1 个；新标签会自动出现在知识分类中）</span>
        {existingTags.some((tag) => !tags.includes(tag)) && (
          <div className="existing-tag-picker">
            <small>点击添加已有标签</small>
            <div>
              {existingTags
                .filter((tag) => !tags.includes(tag))
                .map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setTags((current) => normalizeTags([...current, tag]))}
                    type="button"
                  >
                    ＋ {tag}
                  </button>
                ))}
            </div>
          </div>
        )}
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
                <span>
                  {(publisher.trim() || article.publisher) !== "机构待补充"
                    ? `${publisher.trim() || article.publisher} · `
                    : ""}
                  {article.publishedAt}
                </span>
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
                      ? "推荐给团队"
                      : "推荐并开始阅读"}
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
  const [method, setMethod] = useState<"arxiv" | "pdf">("arxiv");

  return (
    <div className="reading-list-importer">
      <div className="import-method-switch" role="tablist" aria-label="选择导入方式">
        <button
          aria-selected={method === "arxiv"}
          className={method === "arxiv" ? "active" : ""}
          onClick={() => setMethod("arxiv")}
          role="tab"
          type="button"
        >
          从 arXiv 获取
          <small>输入标题，自动下载并缓存</small>
        </button>
        <button
          aria-selected={method === "pdf"}
          className={method === "pdf" ? "active" : ""}
          onClick={() => setMethod("pdf")}
          role="tab"
          type="button"
        >
          上传本地 PDF
          <small>拖入已经下载好的论文</small>
        </button>
      </div>
      {method === "arxiv" ? <ArxivLookup addToReadingList /> : <PdfDropImporter />}
    </div>
  );
}

function PdfDropImporter() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const [publisher, setPublisher] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const existingTags = useExistingTags();

  function chooseFile(nextFile?: File) {
    if (!nextFile) return;
    if (nextFile.type !== "application/pdf" && !nextFile.name.toLowerCase().endsWith(".pdf")) {
      setMessage("请选择 PDF 文件。");
      return;
    }
    setFile(nextFile);
    setTitle((current) => current || nextFile.name.replace(/\.pdf$/i, ""));
    setMessage("");
  }

  function addTag() {
    setTags((current) => normalizeTags([...current, tagDraft]));
    setTagDraft("");
  }

  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      setMessage("请先拖入或选择一份 PDF。");
      return;
    }
    if (tags.length === 0) {
      setMessage("请至少添加一个文章标签。");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("title", title);
      form.set("tags", JSON.stringify(tags));
      if (publisher.trim()) form.set("publisher", publisher.trim());
      if (publishedAt) form.set("publishedAt", publishedAt);

      const response = await fetch("/api/articles/upload", {
        method: "POST",
        body: form,
      });
      await responseJson(response);
      setMessage("PDF 已保存到团队文章库并加入待读列表；上传不会把它标记为已读。");
      setFile(null);
      setTitle("");
      setPublishedAt("");
      if (fileInput.current) fileInput.current.value = "";
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "上传失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="pdf-drop-importer" onSubmit={upload}>
      <p className="pdf-download-hint">
        适用于 arXiv 搜索不到的文章：请先从论文官网或其他来源下载 PDF，再拖动导入。
      </p>
      <button
        className={`pdf-drop-zone${dragging ? " dragging" : ""}${file ? " has-file" : ""}`}
        onClick={() => fileInput.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragging(false);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          chooseFile(event.dataTransfer.files[0]);
        }}
        type="button"
      >
        <span aria-hidden="true">{file ? "✓" : "⇧"}</span>
        <strong>{file ? file.name : "把 PDF 拖到这里"}</strong>
        <small>
          {file
            ? `${(file.size / 1024 / 1024).toFixed(1)} MB · 点击可重新选择`
            : "或点击选择文件，最大 50 MB"}
        </small>
      </button>
      <input
        accept="application/pdf,.pdf"
        className="visually-hidden"
        onChange={(event) => chooseFile(event.target.files?.[0])}
        ref={fileInput}
        type="file"
      />

      <div className="pdf-upload-fields">
        <label>
          文章名称
          <input
            onChange={(event) => setTitle(event.target.value)}
            placeholder="选择 PDF 后自动填写，也可以修改"
            required
            value={title}
          />
        </label>
        <label>
          论文日期（选填）
          <input
            onChange={(event) => setPublishedAt(event.target.value)}
            type="date"
            value={publishedAt}
          />
        </label>
        <label>
          发布机构（选填）
          <input
            onChange={(event) => setPublisher(event.target.value)}
            placeholder="例如 Stanford University"
            value={publisher}
          />
        </label>
      </div>

      <div className="tag-editor">
        <span>文章标签（至少 1 个；新标签会自动出现在知识分类中）</span>
        {existingTags.some((tag) => !tags.includes(tag)) && (
          <div className="existing-tag-picker">
            <small>点击添加已有标签</small>
            <div>
              {existingTags
                .filter((tag) => !tags.includes(tag))
                .map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setTags((current) => normalizeTags([...current, tag]))}
                    type="button"
                  >
                    ＋ {tag}
                  </button>
                ))}
            </div>
          </div>
        )}
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
              addTag();
            }}
            placeholder="输入标签后按 Enter"
            value={tagDraft}
          />
          <button onClick={addTag} type="button">添加</button>
        </div>
      </div>

      {message && <p className="workflow-message" role="status">{message}</p>}
      <button className="pdf-upload-submit" disabled={busy || !file || tags.length === 0} type="submit">
        {busy ? "正在上传并添加…" : "推荐给团队"}
      </button>
    </form>
  );
}

type AnnotationRect = { x: number; y: number; width: number; height: number };
type ReadingNote = {
  page: number;
  quote: string;
  translation: string;
  content: string;
  rect?: AnnotationRect | null;
};
type CommunityAnnotation = ReadingNote & {
  id: number;
  reviewId: number;
  author: string;
};
type CommunityReview = {
  id: number;
  author: string;
  content: string;
  rating: number;
  reviewType: "short" | "long";
  mustRead: boolean;
  likeCount: number;
  likedByViewer: boolean;
  attachments: { id: number; reviewId: number; note: string }[];
};

function arxivPageUrl(sourceUrl: string) {
  try {
    const parsed = new URL(sourceUrl);
    if (!["arxiv.org", "www.arxiv.org"].includes(parsed.hostname)) return null;
    const id = parsed.pathname.match(/^\/(?:abs|pdf)\/([^/]+?)(?:\.pdf)?$/)?.[1];
    return id ? `https://arxiv.org/abs/${id}` : null;
  } catch {
    return null;
  }
}

function PdfPageCanvas({
  url,
  page,
  zoom,
  onLoad,
  onError,
  children,
}: {
  url: string;
  page: number;
  zoom: number;
  onLoad: () => void;
  onError: () => void;
  children: ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: PDFDocumentLoadingTask | undefined;
    setPdfDocument(null);
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        const workerUrl = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        pdfjs.GlobalWorkerOptions.workerSrc = `${workerUrl}?v=1.12.3`;
        const nextLoadingTask = pdfjs.getDocument(url);
        loadingTask = nextLoadingTask;
        const document = await nextLoadingTask.promise;
        if (!cancelled) setPdfDocument(document);
      } catch {
        if (!cancelled) onError();
      }
    })();
    return () => {
      cancelled = true;
      void loadingTask?.destroy();
    };
  }, [url, onError]);

  useEffect(() => {
    if (!pdfDocument) return;
    let cancelled = false;
    let renderTask: RenderTask | undefined;
    void (async () => {
      try {
        const pdfPage = await pdfDocument.getPage(Math.min(Math.max(1, page), pdfDocument.numPages));
        const viewport = pdfPage.getViewport({ scale: (zoom / 100) * (96 / 72) });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        const pixelRatio = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        setPageSize({ width: viewport.width, height: viewport.height });
        const context = canvas.getContext("2d");
        if (!context) throw new Error("canvas unavailable");
        const nextRenderTask = pdfPage.render({
          canvas,
          canvasContext: context,
          viewport,
          transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
        });
        renderTask = nextRenderTask;
        await nextRenderTask.promise;
        if (!cancelled) onLoad();
      } catch (error) {
        if (!cancelled && (error as Error).name !== "RenderingCancelledException") onError();
      }
    })();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdfDocument, page, zoom, onLoad, onError]);

  return (
    <div className="pdf-page-scroll">
      <div className="pdf-page-canvas" style={{ width: pageSize.width || undefined, height: pageSize.height || undefined }}>
        <canvas ref={canvasRef} />
        {children}
      </div>
    </div>
  );
}

export function ReviewComposer({
  articles,
  initialArticleId,
  startFocused = false,
  translationEnabled = false,
}: {
  articles: ReaderArticle[];
  initialArticleId?: number;
  startFocused?: boolean;
  translationEnabled?: boolean;
}) {
  const router = useRouter();
  const startingArticleId = initialArticleId ?? articles[0]?.id ?? 0;
  const startingArticle = articles.find((article) => article.id === startingArticleId);
  const startingReview = startingArticle?.ownReview;
  const [availableArticles, setAvailableArticles] = useState(articles);
  const [articleId, setArticleId] = useState(startingArticleId);
  const [articleSearch, setArticleSearch] = useState("");
  const [articleTag, setArticleTag] = useState("全部");
  const [rating, setRating] = useState(startingReview?.rating ?? 4);
  const [mustRead, setMustRead] = useState(startingReview?.mustRead ?? false);
  const [reviewType, setReviewType] = useState<"short" | "long">(startingReview?.reviewType ?? "long");
  const [content, setContent] = useState(startingReview?.content ?? "");
  const [page, setPage] = useState(
    articles.find((article) => article.id === initialArticleId)?.lastReadPage ??
      articles[0]?.lastReadPage ??
      1,
  );
  const [zoom, setZoom] = useState(100);
  const [focusMode, setFocusMode] = useState(startFocused);
  const [contextTab, setContextTab] = useState<"discussion" | "notes" | "review">("discussion");
  const [communityReviews, setCommunityReviews] = useState<CommunityReview[]>([]);
  const [communityAnnotations, setCommunityAnnotations] = useState<CommunityAnnotation[]>([]);
  const [discussionLoading, setDiscussionLoading] = useState(false);
  const [localCache, setLocalCache] = useState<{
    status: "idle" | "loading" | "ready" | "unsupported" | "error" | "timeout";
    progress: number;
  }>({ status: "idle", progress: 0 });
  const [localPdfUrl, setLocalPdfUrl] = useState("");
  const [localPdfName, setLocalPdfName] = useState("");
  const [readerDragging, setReaderDragging] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [quoteDraft, setQuoteDraft] = useState("");
  const [translation, setTranslation] = useState("");
  const [translating, setTranslating] = useState(false);
  const [notes, setNotes] = useState<ReadingNote[]>(startingReview?.annotations ?? []);
  const [drawingAnnotation, setDrawingAnnotation] = useState(false);
  const [annotationStart, setAnnotationStart] = useState<{ x: number; y: number } | null>(null);
  const [annotationRect, setAnnotationRect] = useState<AnnotationRect | null>(null);
  const [annotationPage, setAnnotationPage] = useState(page);
  const [tagDraft, setTagDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(true);
  const [pdfRenderAttempt, setPdfRenderAttempt] = useState(0);
  const [message, setMessage] = useState("");
  const readerFileInput = useRef<HTMLInputElement>(null);
  const activeCacheArticle = useRef(0);
  const localPdfUrlRef = useRef("");
  const sessionPdfUrls = useRef(new Map<number, string>());

  const selectedArticle = availableArticles.find((item) => item.id === articleId);
  const selectedArxivPage = selectedArticle
    ? arxivPageUrl(selectedArticle.sourceUrl)
    : null;
  const searchableTags = useMemo(
    () => ["全部", ...new Set(availableArticles.flatMap((article) => article.tags))],
    [availableArticles],
  );
  const filteredArticles = useMemo(() => {
    const terms = articleSearch.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return availableArticles.filter((article) => {
      if (articleTag !== "全部" && !article.tags.includes(articleTag)) return false;
      const haystack = [article.title, article.publisher, article.authors.join(" "), article.tags.join(" ")]
        .join(" ")
        .toLocaleLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }, [articleSearch, articleTag, availableArticles]);

  useEffect(() => {
    if (!focusMode) return;
    const exitOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFocusMode(false);
    };
    window.addEventListener("keydown", exitOnEscape);
    return () => window.removeEventListener("keydown", exitOnEscape);
  }, [focusMode]);

  useEffect(() => {
    if (navigator.storage?.persist) void navigator.storage.persist();
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.getRegistrations().then((registrations) =>
        Promise.all(registrations
          .filter((registration) => registration.active?.scriptURL.endsWith("/pdf-cache-worker.js"))
          .map((registration) => registration.unregister()))
      );
    }
  }, []);

  useEffect(() => {
    if (!articleId) return;
    let cancelled = false;
    setDiscussionLoading(true);
    fetch(`/api/articles/${articleId}/discussion`)
      .then(responseJson)
      .then((data) => {
        if (cancelled) return;
        setCommunityReviews((data.reviews as CommunityReview[]) ?? []);
        setCommunityAnnotations((data.annotations as CommunityAnnotation[]) ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setCommunityReviews([]);
          setCommunityAnnotations([]);
        }
      })
      .finally(() => {
        if (!cancelled) setDiscussionLoading(false);
      });
    return () => { cancelled = true; };
  }, [articleId]);

  useEffect(() => {
    if (focusMode && articleId) void cachePdfLocally(articleId);
  }, [focusMode, articleId]);

  useEffect(() => {
    if (focusMode || !articleId || sessionPdfUrls.current.has(articleId)) return;
    const preload = window.setTimeout(() => void cachePdfLocally(articleId), 600);
    return () => window.clearTimeout(preload);
  }, [focusMode, articleId]);

  useEffect(() => () => {
    sessionPdfUrls.current.forEach((url) => URL.revokeObjectURL(url));
    sessionPdfUrls.current.clear();
  }, []);

  function selectArticle(id: number) {
    const article = availableArticles.find((item) => item.id === id);
    setArticleId(id);
    setPdfLoading(true);
    setPage(article?.lastReadPage ?? 1);
    setRating(article?.ownReview?.rating ?? 4);
    setMustRead(article?.ownReview?.mustRead ?? false);
    setReviewType(article?.ownReview?.reviewType ?? "long");
    setContent(article?.ownReview?.content ?? "");
    setNotes(article?.ownReview?.annotations ?? []);
    setDrawingAnnotation(false);
    setAnnotationStart(null);
    setAnnotationRect(null);
    setContextTab("discussion");
    const sessionUrl = sessionPdfUrls.current.get(id) ?? "";
    localPdfUrlRef.current = sessionUrl;
    setLocalPdfUrl(sessionUrl);
    setLocalPdfName("");
    setLocalCache(sessionUrl
      ? { status: "ready", progress: 100 }
      : { status: "idle", progress: 0 });
    setFocusMode(false);
    if (!sessionUrl) window.setTimeout(() => void cachePdfLocally(id), 0);
  }

  function beginReading() {
    if (!selectedArticle) return;
    setPdfLoading(true);
    setFocusMode(true);
  }

  function useReaderPdf(nextFile?: File) {
    if (!nextFile) return;
    if (nextFile.type !== "application/pdf" && !nextFile.name.toLowerCase().endsWith(".pdf")) {
      setMessage("请选择 PDF 文件。");
      return;
    }
    activeCacheArticle.current = 0;
    const previousUrl = sessionPdfUrls.current.get(articleId);
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    const objectUrl = URL.createObjectURL(nextFile);
    sessionPdfUrls.current.set(articleId, objectUrl);
    localPdfUrlRef.current = objectUrl;
    setLocalPdfUrl(objectUrl);
    setLocalPdfName(nextFile.name);
    setLocalCache({ status: "ready", progress: 100 });
    setPdfLoading(true);
    setMessage(`已在阅读器中打开本地文件 ${nextFile.name}，文件不会上传。`);
  }

  async function cachePdfLocally(id: number) {
    const sessionUrl = sessionPdfUrls.current.get(id);
    if (sessionUrl) {
      localPdfUrlRef.current = sessionUrl;
      setLocalPdfUrl(sessionUrl);
      setLocalCache({ status: "ready", progress: 100 });
      return;
    }
    if (activeCacheArticle.current === id) return;
    activeCacheArticle.current = id;
    const cacheKey = `/api/articles/${id}/pdf`;
    const cacheRequest = new Request(new URL(cacheKey, window.location.origin), {
      credentials: "same-origin",
    });
    const controller = new AbortController();
    let downloadTimedOut = false;
    let timeoutId: number | undefined;
    try {
      const cache = "caches" in window
        ? await caches.open("wisdomloong-papers-v1")
        : null;
      const cached = await cache?.match(cacheRequest);
      if (cached) {
        const blob = await cached.blob();
        if (blob.size < 1024) {
          await cache?.delete(cacheRequest);
        } else {
          const objectUrl = URL.createObjectURL(blob);
          sessionPdfUrls.current.set(id, objectUrl);
          localPdfUrlRef.current = objectUrl;
          setLocalPdfUrl(objectUrl);
          setLocalCache({ status: "ready", progress: 100 });
          return;
        }
      }
      setLocalCache({ status: "loading", progress: 1 });
      timeoutId = window.setTimeout(() => {
        downloadTimedOut = true;
        controller.abort();
      }, 150_000);
      const response = await fetch(cacheRequest, {
        cache: "default",
        signal: controller.signal,
      });
      if (!response.ok || !response.body) throw new Error("download failed");
      const total = Number(response.headers.get("content-length")) || 0;
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.byteLength;
        if (activeCacheArticle.current === id && total > 0) {
          setLocalCache({ status: "loading", progress: Math.min(99, Math.round(received / total * 100)) });
        }
      }
      const blob = new Blob(chunks as BlobPart[], { type: "application/pdf" });
      if (activeCacheArticle.current === id) {
        const objectUrl = URL.createObjectURL(blob);
        sessionPdfUrls.current.set(id, objectUrl);
        localPdfUrlRef.current = objectUrl;
        setLocalPdfUrl(objectUrl);
        setLocalCache({ status: "ready", progress: 100 });
      }
      try {
        await cache?.put(cacheRequest, new Response(blob, {
          headers: { "Content-Type": "application/pdf", "Content-Length": String(blob.size) },
        }));
      } catch {
        setMessage("论文已经打开，但浏览器未授予持久存储空间；下次可能需要重新读取。");
      }
    } catch {
      if (activeCacheArticle.current === id) {
        setLocalCache({ status: downloadTimedOut ? "timeout" : "error", progress: 0 });
      }
    } finally {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      if (activeCacheArticle.current === id) activeCacheArticle.current = 0;
    }
  }

  function retryPdfDownload() {
    activeCacheArticle.current = 0;
    setLocalCache({ status: "idle", progress: 0 });
    setPdfLoading(true);
    setPdfRenderAttempt((value) => value + 1);
    void cachePdfLocally(articleId);
  }

  const handlePdfPageLoad = useCallback(() => setPdfLoading(false), []);
  const handlePdfPageError = useCallback(() => {
    setLocalCache({ status: "error", progress: 0 });
    setPdfLoading(true);
  }, []);

  async function saveReadingBookmark() {
    if (!selectedArticle) return;
    try {
      await responseJson(await fetch(`/api/articles/${selectedArticle.id}/progress`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page }),
      }));
      setAvailableArticles((current) => current.map((article) =>
        article.id === selectedArticle.id ? { ...article, lastReadPage: page } : article
      ));
      setMessage(`已标记读到第 ${page} 页，下次打开会从这里继续。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "阅读书签保存失败");
    }
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

  function annotationPoint(event: ReactPointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100)),
      y: Math.max(0, Math.min(100, ((event.clientY - bounds.top) / bounds.height) * 100)),
    };
  }

  function updateAnnotationRect(event: ReactPointerEvent<HTMLDivElement>) {
    if (!annotationStart) return;
    const point = annotationPoint(event);
    setAnnotationRect({
      x: Math.min(annotationStart.x, point.x),
      y: Math.min(annotationStart.y, point.y),
      width: Math.abs(point.x - annotationStart.x),
      height: Math.abs(point.y - annotationStart.y),
    });
  }

  function startDrawingAnnotation() {
    setDrawingAnnotation(true);
    setAnnotationRect(null);
    setAnnotationPage(page);
    setContextTab("notes");
    setMessage("请在当前 PDF 页面上拖动画框；位置会随页码一起保存并分享给伙伴。");
  }

  async function readClipboard() {
    try {
      const value = await navigator.clipboard.readText();
      setQuoteDraft(value);
      setTranslation("");
      if (!value.trim()) setMessage("剪贴板里没有可翻译的文字。");
    } catch {
      setMessage("无法读取剪贴板，请直接粘贴论文原文。");
    }
  }

  async function translateQuote() {
    if (!quoteDraft.trim()) return;
    setTranslating(true);
    setMessage("");
    try {
      const data = await responseJson(await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: quoteDraft }),
      }));
      setTranslation(String(data.translation ?? ""));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "翻译失败");
    } finally {
      setTranslating(false);
    }
  }

  async function submitReview(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articleId,
          rating,
          mustRead,
          reviewType,
          content: content.trim(),
          annotations: notes,
        }),
      });
      await responseJson(response);
      const updatedReview = { rating, mustRead, reviewType, content: content.trim(), annotations: notes };
      setAvailableArticles((current) => current.map((article) =>
        article.id === articleId ? { ...article, ownReview: updatedReview } : article
      ));
      setMessage(selectedArticle?.ownReview
        ? "评论修改已保存。"
        : "评论已发布。文章已从你的待读列表中移除。");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "评论保存失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`reader-workspace${focusMode ? " focus-mode" : ""}`}>
      {focusMode && (
        <div className="focus-status">
          <span><i />扩展组件知识库中</span>
          <small>
            {localCache.status === "loading"
              ? `正在保存到本地 ${localCache.progress}%`
              : localCache.status === "ready"
                ? "已存入本地阅读器"
                : "按 Esc 返回文章库"}
          </small>
          <button onClick={() => setFocusMode(false)} type="button">结束阅读</button>
        </div>
      )}
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
        <div className="library-search-meta">
          <span>找到 {filteredArticles.length} 篇</span>
          {articleSearch && <button onClick={() => setArticleSearch("")} type="button">清空</button>}
        </div>
        <div className="library-tag-filter">
          {searchableTags.map((tag) => (
            <button
              className={articleTag === tag ? "selected" : ""}
              key={tag}
              onClick={() => setArticleTag(tag)}
              type="button"
            >
              {tag}
            </button>
          ))}
        </div>
        <div className="article-search-results">
          {filteredArticles.map((article) => (
            <button
              className={article.id === articleId ? "selected" : ""}
              key={article.id}
              onClick={() => selectArticle(article.id)}
              type="button"
            >
              {article.publisher !== "机构待补充" &&
                article.publisher.toLocaleLowerCase() !== "arxiv" && (
                  <span>{article.publisher}</span>
                )}
              <strong>{article.title}</strong>
              <small>{article.tags.join(" · ")}</small>
              {article.lastReadPage && <em>上次读到 P.{article.lastReadPage}</em>}
            </button>
          ))}
          {filteredArticles.length === 0 && <p>没有匹配文章</p>}
        </div>
        <a className="reader-import-link" href="/reading-list#recommend-article">
          ＋ 推荐一篇新文章
        </a>
      </aside>

      <section className="paper-reader">
        {selectedArticle ? (
          <>
            <header className="reader-titlebar">
              <div>
                {selectedArticle.publisher !== "机构待补充" &&
                  selectedArticle.publisher.toLocaleLowerCase() !== "arxiv" && (
                    <span>{selectedArticle.publisher}</span>
                  )}
                <h2>{selectedArticle.title}</h2>
                <p>{selectedArticle.authors.join(", ")}</p>
                <div className="reader-essential-meta">
                  <strong>{selectedArticle.publishedAt ?? "日期暂无"}</strong>
                  <span>{selectedArticle.tags.join(" · ")}</span>
                </div>
              </div>
              {!selectedArticle.sourceUrl.startsWith("/api/") && (
                <a href={selectedArticle.sourceUrl} rel="noreferrer" target="_blank">来源页面 ↗</a>
              )}
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
            {focusMode ? (
              <>
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
                  <button className="active-focus" onClick={() => setFocusMode(false)} type="button">结束阅读</button>
                  <button onClick={() => readerFileInput.current?.click()} type="button">
                    ⇧ {localPdfName ? "更换本地 PDF" : "打开本地 PDF"}
                  </button>
                  <button className="capture-button" disabled={!localPdfUrl || pdfLoading} onClick={startDrawingAnnotation} type="button">
                    ▣ 画框批注
                  </button>
                </div>
                <input
                  accept="application/pdf,.pdf"
                  className="visually-hidden"
                  onChange={(event) => useReaderPdf(event.target.files?.[0])}
                  ref={readerFileInput}
                  type="file"
                />
                <div
                  className={`pdf-frame${pdfLoading ? " is-loading" : ""}${readerDragging ? " is-dragging" : ""}`}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setReaderDragging(true);
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault();
                    if (event.currentTarget === event.target) setReaderDragging(false);
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    setReaderDragging(false);
                    useReaderPdf(event.dataTransfer.files[0]);
                  }}
                >
                  {readerDragging && (
                    <div className="reader-pdf-drop">
                      <strong>松开即可在阅读器中打开</strong>
                      <small>只在当前浏览器使用，不会重复上传文章</small>
                    </div>
                  )}
                  {(!localPdfUrl || pdfLoading) && (
                    <div className="pdf-loading" role="status">
                      {localCache.status !== "error" && localCache.status !== "timeout" && <span />}
                      <strong>
                        {localCache.status === "loading"
                          ? `正在下载到本地阅读器 ${localCache.progress}%`
                          : localCache.status === "timeout"
                            ? "下载超时"
                          : localCache.status === "error"
                            ? "论文暂时无法加载"
                          : "正在打开本地论文"}
                      </strong>
                      {localCache.status === "error" || localCache.status === "timeout" ? (
                        <>
                          <small>
                            {localCache.status === "timeout"
                              ? "已等待约 150 秒。你可以重试，或下载 PDF 后拖入这个阅读区域。"
                              : "你可以重试，或下载 PDF 后拖入这个阅读区域。"}
                          </small>
                          <div className="pdf-fallback-actions">
                            <button onClick={retryPdfDownload} type="button">重新下载</button>
                            {selectedArxivPage ? (
                              <a href={selectedArxivPage} rel="noreferrer" target="_blank">
                                在新标签页打开 arXiv 下载页面 ↗
                              </a>
                            ) : (
                              <button onClick={() => readerFileInput.current?.click()} type="button">
                                选择已经下载的本地 PDF
                              </button>
                            )}
                          </div>
                        </>
                      ) : (
                        <small>首次下载可能需要一些时间，请保持页面打开；完成后翻页不再访问网络。</small>
                      )}
                    </div>
                  )}
                  {localPdfUrl && (
                    <PdfPageCanvas
                      key={`${articleId}-${pdfRenderAttempt}`}
                      onError={handlePdfPageError}
                      onLoad={handlePdfPageLoad}
                      page={page}
                      url={localPdfUrl}
                      zoom={zoom}
                    >
                      <div
                      aria-label={drawingAnnotation ? "在当前 PDF 页拖动画框" : "PDF 画框批注层"}
                      className={`pdf-annotation-layer${drawingAnnotation ? " is-drawing" : ""}`}
                      onPointerDown={(event) => {
                        if (!drawingAnnotation) return;
                        event.currentTarget.setPointerCapture(event.pointerId);
                        const point = annotationPoint(event);
                        setAnnotationStart(point);
                        setAnnotationRect({ ...point, width: 0, height: 0 });
                      }}
                      onPointerMove={updateAnnotationRect}
                      onPointerUp={(event) => {
                        if (!annotationStart) return;
                        const point = annotationPoint(event);
                        const nextRect = {
                          x: Math.min(annotationStart.x, point.x),
                          y: Math.min(annotationStart.y, point.y),
                          width: Math.abs(point.x - annotationStart.x),
                          height: Math.abs(point.y - annotationStart.y),
                        };
                        setAnnotationStart(null);
                        setDrawingAnnotation(false);
                        if (nextRect.width < 1 || nextRect.height < 1) {
                          setAnnotationRect(null);
                          setMessage("画框太小，请重新拖动选择要批注的区域。");
                          return;
                        }
                        setAnnotationRect(nextRect);
                        setAnnotationPage(page);
                        setMessage(`已框选第 ${page} 页，请在右侧填写批注并加入。`);
                      }}
                      >
                      {communityAnnotations.filter((item) => item.page === page && item.rect).map((item) => (
                        <span
                          className="pdf-annotation-box is-community"
                          key={`community-${item.id}`}
                          style={{ left: `${item.rect!.x}%`, top: `${item.rect!.y}%`, width: `${item.rect!.width}%`, height: `${item.rect!.height}%` }}
                          title={`${item.author}：${item.content}`}
                        />
                      ))}
                      {notes.filter((item) => item.page === page && item.rect).map((item, index) => (
                        <span
                          className="pdf-annotation-box is-own"
                          key={`own-${index}`}
                          style={{ left: `${item.rect!.x}%`, top: `${item.rect!.y}%`, width: `${item.rect!.width}%`, height: `${item.rect!.height}%` }}
                          title={`我的批注：${item.content}`}
                        />
                      ))}
                      {annotationRect && annotationPage === page && (
                        <span
                          className="pdf-annotation-box is-pending"
                          style={{ left: `${annotationRect.x}%`, top: `${annotationRect.y}%`, width: `${annotationRect.width}%`, height: `${annotationRect.height}%` }}
                        />
                      )}
                      {drawingAnnotation && !annotationStart && <strong>拖动鼠标框选论文中的图片或段落</strong>}
                      </div>
                    </PdfPageCanvas>
                  )}
                </div>
                <div className="reading-bookmark">
                  <div>
                    <span>阅读书签</span>
                    <strong>
                      {selectedArticle.lastReadPage
                        ? `上次读到 P.${selectedArticle.lastReadPage}`
                        : "还没有保存阅读位置"}
                    </strong>
                  </div>
                  <button onClick={saveReadingBookmark} type="button">◉ 标记读到第 {page} 页</button>
                </div>
              </>
            ) : (
              <div className="article-reading-preview">
                <section>
                  <span>摘要</span>
                  <p>{selectedArticle.abstract || "这篇文章暂时没有摘要。"}</p>
                </section>
                <section>
                  <header>
                    <div>
                      <span>伙伴评论</span>
                      <strong>{communityReviews.length} 条评论 · {communityAnnotations.length} 条逐页批注</strong>
                    </div>
                    <button onClick={beginReading} type="button">
                      {selectedArticle.lastReadPage ? `从 P.${selectedArticle.lastReadPage} 继续阅读` : "开始阅读"}
                    </button>
                  </header>
                  <div className="preview-comments">
                    {communityReviews.slice(0, 3).map((review) => (
                      <article key={review.id}>
                        <span>{review.author.slice(0, 1).toUpperCase()}</span>
                        <div>
                          <strong>{review.author} · {review.mustRead ? "✦ 必读" : `★ ${review.rating}`}</strong>
                          <p>{review.content}</p>
                        </div>
                      </article>
                    ))}
                    {!discussionLoading && communityReviews.length === 0 && <p>还没有伙伴评论，开始阅读后可以留下第一条。</p>}
                  </div>
                </section>
              </div>
            )}
          </>
        ) : (
          <div className="empty"><h3>先选择一篇文章</h3><p>也可以从 arXiv 导入新文章。</p></div>
        )}
      </section>

      <aside className="reader-notebook">
        <div className="notebook-heading">
          <span>阅读上下文</span>
          <small>当前第 {page} 页</small>
        </div>
        <div className="context-tabs">
          <button className={contextTab === "discussion" ? "selected" : ""} onClick={() => setContextTab("discussion")} type="button">
            伙伴批注 <span>{communityAnnotations.length}</span>
          </button>
          <button className={contextTab === "notes" ? "selected" : ""} onClick={() => setContextTab("notes")} type="button">
            我的笔记 <span>{notes.length}</span>
          </button>
          <button className={contextTab === "review" ? "selected" : ""} onClick={() => setContextTab("review")} type="button">
            整体评论
          </button>
        </div>
        <div className="context-panel community-panel" hidden={contextTab !== "discussion"}>
          {discussionLoading ? (
            <p className="context-empty">正在加载伙伴观点…</p>
          ) : (
            <>
              <div className="current-page-discussion">
                <h3>第 {page} 页的批注</h3>
                {communityAnnotations.filter((item) => item.page === page).map((annotation) => (
                  <article key={annotation.id}>
                    <header><span>{annotation.author.slice(0, 1).toUpperCase()}</span><strong>{annotation.author}</strong></header>
                    {annotation.quote && <blockquote>{annotation.quote}</blockquote>}
                    {annotation.translation && <p className="community-translation">{annotation.translation}</p>}
                    <p>{annotation.rect ? "▣ " : ""}{annotation.content}</p>
                  </article>
                ))}
                {communityAnnotations.every((item) => item.page !== page) && (
                  <p className="context-empty">这一页还没有伙伴批注，你可以留下第一条。</p>
                )}
              </div>
              {communityAnnotations.some((item) => item.page !== page) && (
                <div className="other-page-discussion">
                  <h3>其他页的批注</h3>
                  {communityAnnotations.filter((item) => item.page !== page).map((annotation) => (
                    <button key={annotation.id} onClick={() => setPage(annotation.page)} type="button">
                      <strong>P.{annotation.page}</strong>
                      <span><b>{annotation.author}</b>{annotation.rect ? "▣ " : ""}{annotation.content}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="community-overall-reviews">
                <h3>成员整体评论</h3>
                {communityReviews.map((review) => (
                  <details key={review.id}>
                    <summary>
                      <span>{review.author.slice(0, 1).toUpperCase()}</span>
                      <strong>{review.author}</strong>
                      <small>
                        {review.mustRead ? "✦ 必读" : `★ ${review.rating}`}
                        {" · "}
                        {review.reviewType === "long" ? "长评" : "短评"}
                      </small>
                    </summary>
                    <p>{review.content}</p>
                    {review.attachments.length > 0 && (
                      <div className="community-images">
                        {review.attachments.map((attachment) => (
                          <figure key={attachment.id}>
                            <img alt={attachment.note || "论文图表评论"} src={`/api/review-attachments/${attachment.id}`} />
                            {attachment.note && <figcaption>{attachment.note}</figcaption>}
                          </figure>
                        ))}
                      </div>
                    )}
                    {review.reviewType === "long" && (
                      <ReviewLikeButton
                        initialCount={review.likeCount}
                        initiallyLiked={review.likedByViewer}
                        reviewId={review.id}
                      />
                    )}
                  </details>
                ))}
                {communityReviews.length === 0 && <p className="context-empty">还没有其他成员留下整体评论。</p>}
              </div>
            </>
          )}
        </div>
        <div className="context-panel" hidden={contextTab !== "notes"}>
        {translationEnabled ? (
          <section className="translation-assistant">
            <div>
              <strong>中译助手</strong>
              <button onClick={readClipboard} type="button">从剪贴板粘贴</button>
            </div>
            <textarea
              onChange={(event) => {
                setQuoteDraft(event.target.value);
                setTranslation("");
              }}
              placeholder="在论文中复制英文段落，然后点“从剪贴板粘贴”…"
              rows={4}
              value={quoteDraft}
            />
            <button disabled={!quoteDraft.trim() || translating} onClick={translateQuote} type="button">
              {translating ? "百炼正在翻译…" : "翻译成中文"}
            </button>
            {translation && (
              <div className="translation-result">
                <span>中文译文</span>
                <p>{translation}</p>
              </div>
            )}
          </section>
        ) : (
          <section className="translation-assistant coming-soon">
            <div><strong>中译助手</strong><span>即将上线</span></div>
            <p>选中论文原文，一键获得适合学术阅读的中文翻译。</p>
          </section>
        )}
        <section className="note-composer">
          <header>
            <span>P.{annotationRect ? annotationPage : page}</span>
            <div>
              <strong>{annotationRect ? "为画框区域添加批注" : "记录这一页"}</strong>
              <small>{annotationRect ? "画框位置会与页码一起分享" : "观点、疑问或值得分享的判断"}</small>
            </div>
          </header>
          <textarea
            onChange={(event) => setNoteDraft(event.target.value)}
            placeholder="写下你对这一页的理解…"
            rows={5}
            value={noteDraft}
          />
          <footer>
            <span>发布长评时可作为逐页批注分享</span>
            <button
              disabled={!noteDraft.trim()}
              onClick={() => {
                setNotes((current) => [...current, {
                  page: annotationRect ? annotationPage : page,
                  quote: quoteDraft.trim(),
                  translation: translation.trim(),
                  content: noteDraft.trim(),
                  rect: annotationRect,
                }]);
                setNoteDraft("");
                setQuoteDraft("");
                setTranslation("");
                setAnnotationRect(null);
              }}
              type="button"
            >
              ＋ 加入我的批注
            </button>
          </footer>
        </section>
        <div className="saved-notes">
          {notes.length > 0 && <h3>已记录 {notes.length} 条</h3>}
          {notes.map((note, index) => (
            <div key={`${note.page}-${index}`}>
              <button onClick={() => setPage(note.page)} type="button">
                <strong>P.{note.page}</strong>
                <span>{note.rect ? "▣ " : ""}{note.content}</span>
              </button>
              <button aria-label="删除这条批注" onClick={() => setNotes((current) => current.filter((_, itemIndex) => itemIndex !== index))} type="button">×</button>
            </div>
          ))}
        </div>
        </div>

        <form className="review-form reader-review-form" hidden={contextTab !== "review"} onSubmit={submitReview}>
          <h2>{selectedArticle?.ownReview ? "修改我的评论" : "留下评论"}</h2>
          <div className="review-type-switch">
            <button className={reviewType === "short" ? "selected" : ""} onClick={() => setReviewType("short")} type="button">
              <strong>短评</strong><span>一句话判断</span>
            </button>
            <button className={reviewType === "long" ? "selected" : ""} onClick={() => setReviewType("long")} type="button">
              <strong>长评</strong><span>完整解读</span>
            </button>
          </div>
          <div className={`star-rating rating-${rating}${mustRead ? " is-must-read" : ""}`}>
            <span>我的推荐等级</span>
            <div>
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  aria-label={`${value} 星`}
                  className={value <= rating ? "filled" : ""}
                  key={value}
                  onClick={() => {
                    setRating(value);
                    setMustRead(false);
                  }}
                  type="button"
                >★</button>
              ))}
              <strong>{mustRead ? "✦ 必读" : `${rating}.0`}</strong>
            </div>
          </div>
          <label className={`must-read-toggle${mustRead ? " selected" : ""}`}>
            <input
              checked={mustRead}
              onChange={(event) => {
                setMustRead(event.target.checked);
                if (event.target.checked) setRating(5);
              }}
              type="checkbox"
            />
            <span aria-hidden="true">✦</span>
            <div><strong>必读</strong><small>高于五星 · 向团队重点推荐</small></div>
            <em>五星之上</em>
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
            {busy
              ? "正在保存…"
              : selectedArticle?.ownReview
                ? "保存修改"
                : `发布${reviewType === "short" ? "短评" : "长评"}`}
          </button>
        </form>
      </aside>
    </div>
  );
}
