"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  articleCategories,
  type ArticleCategory,
} from "@/lib/knowledge-types";

type ArxivResult = {
  title: string;
  abstract: string;
  authors: string[];
  publishedAt: string;
  publisher: string;
  sourceUrl: string;
  externalId: string;
};

type ExistingArticle = {
  id: number;
  title: string;
  category: ArticleCategory;
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
  onImported?: (article: ExistingArticle) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ArxivResult[]>([]);
  const [category, setCategory] = useState<ArticleCategory>("Ego第一人称");
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
        body: JSON.stringify({ ...article, category, addToReadingList }),
      });
      const data = await responseJson(response);
      const articleId = Number(data.articleId);
      setMessage(addToReadingList ? "已加入你的待读文章。" : "文章信息已导入，可以开始评论。");
      onImported?.({ id: articleId, title: article.title, category });
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
            onChange={(event) => setCategory(event.target.value as ArticleCategory)}
            value={category}
          >
            {articleCategories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </form>

      {message && <p className="workflow-message" role="status">{message}</p>}

      {results.length > 0 && (
        <div className="lookup-results">
          {results.map((article) => (
            <article key={article.externalId}>
              <div>
                <span>{article.externalId}</span>
                <span>{article.publishedAt}</span>
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

export function ReviewComposer({ articles }: { articles: ExistingArticle[] }) {
  const router = useRouter();
  const [availableArticles, setAvailableArticles] = useState(articles);
  const [articleId, setArticleId] = useState(articles[0]?.id ?? 0);
  const [rating, setRating] = useState(5);
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  function useImportedArticle(article: ExistingArticle) {
    setAvailableArticles((current) => [
      article,
      ...current.filter((item) => item.id !== article.id),
    ]);
    setArticleId(article.id);
  }

  async function submitReview(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId, rating, content }),
      });
      await responseJson(response);
      setMessage("评论已发布。文章已从你的待读清单中移除。");
      setContent("");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "评论保存失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="review-layout">
      <section className="review-section">
        <div className="section-number">01</div>
        <div>
          <h2>选择已有文章</h2>
          <p>从团队已经导入的文章中选择。</p>
          <select
            className="article-select"
            disabled={availableArticles.length === 0}
            onChange={(event) => setArticleId(Number(event.target.value))}
            value={articleId}
          >
            {availableArticles.length === 0 && <option>还没有文章</option>}
            {availableArticles.map((article) => (
              <option key={article.id} value={article.id}>
                [{article.category}] {article.title}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="review-section">
        <div className="section-number">02</div>
        <div>
          <h2>或从 arXiv 导入</h2>
          <p>只需输入文章名，系统会自动补齐作者、日期、摘要和原文链接。</p>
          <ArxivLookup addToReadingList={false} onImported={useImportedArticle} />
        </div>
      </section>

      <section className="review-section">
        <div className="section-number">03</div>
        <form className="review-form" onSubmit={submitReview}>
          <h2>评分与评论</h2>
          <label>
            评分
            <div className="rating-options">
              {[1, 2, 3, 4, 5].map((value) => (
                <label key={value}>
                  <input
                    checked={rating === value}
                    name="rating"
                    onChange={() => setRating(value)}
                    type="radio"
                    value={value}
                  />
                  <span>{value} ★</span>
                </label>
              ))}
            </div>
          </label>
          <label>
            评论内容
            <textarea
              onChange={(event) => setContent(event.target.value)}
              placeholder="写下这篇文章值得关注的观点、方法与结论…"
              required
              rows={7}
              value={content}
            />
          </label>
          {message && <p className="workflow-message" role="status">{message}</p>}
          <button disabled={busy || articleId === 0} type="submit">
            {busy ? "正在发布…" : "发布评论"}
          </button>
        </form>
      </section>
    </div>
  );
}
