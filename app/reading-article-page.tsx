"use client";

import { useState } from "react";
import { KnowledgePage } from "@/app/knowledge-page";
import { ReadingListImporter, ReviewComposer } from "@/app/article-workflows";
import type { ReaderArticle } from "@/lib/knowledge";

export function ReadingArticlePage({
  articles,
  username,
  initialArticleId,
  initialPartnerNoteReviewId,
  startFocused,
  translationEnabled,
}: {
  articles: ReaderArticle[];
  username: string;
  initialArticleId?: number;
  initialPartnerNoteReviewId?: number;
  startFocused: boolean;
  translationEnabled: boolean;
}) {
  const [importerOpen, setImporterOpen] = useState(false);
  const [pageArticles, setPageArticles] = useState(articles);
  const bestReading = [...pageArticles]
    .filter((article) => (article.readingMembers?.length ?? 0) > 0 && article.readingActivityAt)
    .sort((left, right) => (right.readingActivityAt ?? "").localeCompare(left.readingActivityAt ?? ""))
    .slice(0, 2);

  function addImportedArticle(article: ReaderArticle) {
    setPageArticles((current) => {
      const existing = current.find((item) => item.id === article.id);
      return [
        existing ?? article,
        ...current.filter((item) => item.id !== article.id),
      ];
    });
  }

  return (
    <KnowledgePage
      action={(
        <button
          aria-controls="recommend-article"
          aria-expanded={importerOpen}
          aria-label={importerOpen ? "收起添加文章" : "添加文章"}
          className={`heading-add-article${importerOpen ? " is-open" : ""}`}
          onClick={() => setImporterOpen((current) => !current)}
          title={importerOpen ? "收起添加文章" : "添加文章"}
          type="button"
        >
          <span aria-hidden="true">＋</span>
          <strong>{importerOpen ? "收起" : "添加文章"}</strong>
        </button>
      )}
      description="在专注阅读中截取证据、整理批注，发布读书笔记 PDF 与评论"
      eyebrow="SHARE WHAT YOU LEARNED"
      page="review"
      title="阅读文章"
      username={username}
    >
      {importerOpen && (
        <section className="import-section reading-page-import" id="recommend-article">
          <div className="section-heading reading-page-import-heading">
            <div>
              <span>ADD TO TEAM LIBRARY</span>
              <h2>推荐值得一读的文章</h2>
              <p>从 arXiv 获取，或拖入本地 PDF；添加后全团队都能直接阅读。</p>
            </div>
            <button
              aria-label="收起添加文章"
              onClick={() => setImporterOpen(false)}
              type="button"
            >×</button>
          </div>
          <ReadingListImporter onImported={addImportedArticle} />
        </section>
      )}

      <section className="best-reading">
        <div className="list-title"><h2>最佳在读</h2><span>最新 2 篇</span></div>
        {bestReading.length > 0 ? (
          <div className="best-reading-grid">
            {bestReading.map((article) => (
              <a href={`/reviews/new?article=${article.id}`} key={article.id}>
                <span>在读 · {article.readingMembers?.length ?? 0} 人</span>
                <h3>{article.title}</h3>
                <p><strong>{article.readingMembers?.join("、")}</strong> 有批注或书签</p>
              </a>
            ))}
          </div>
        ) : <div className="empty compact"><h3>还没有在读文章</h3><p>添加批注或书签后会显示在这里。</p></div>}
      </section>

      <ReviewComposer
        articles={pageArticles}
        initialArticleId={initialArticleId}
        initialPartnerNoteReviewId={initialPartnerNoteReviewId}
        startFocused={startFocused}
        translationEnabled={translationEnabled}
        username={username}
      />
    </KnowledgePage>
  );
}
