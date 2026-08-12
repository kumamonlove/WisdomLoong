"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { KnowledgePage } from "@/app/knowledge-page";
import { ReadingListImporter, ReviewComposer } from "@/app/article-workflows";
import { ReadingListButton } from "@/app/reading-actions";
import type { ReaderArticle } from "@/lib/knowledge";

const readingMilestones = [
  { count: 1, title: "初次探索", mark: "◇" },
  { count: 5, title: "渐入佳境", mark: "◐" },
  { count: 10, title: "阅读新星", mark: "✦" },
  { count: 20, title: "知识收藏家", mark: "◈" },
  { count: 50, title: "深度阅读者", mark: "✧" },
  { count: 100, title: "百篇学者", mark: "✺" },
];

function localDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readingJourney(articles: ReaderArticle[]) {
  const readArticles = articles.filter((article) => article.isRead);
  const readCount = readArticles.length;
  const completionDays = new Set(readArticles.flatMap((article) => {
    if (!article.readAt) return [];
    const date = new Date(article.readAt);
    return Number.isNaN(date.getTime()) ? [] : [localDateKey(date)];
  }));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return { key: localDateKey(date), label: "一二三四五六日"[index], active: completionDays.has(localDateKey(date)) };
  });
  const weekCount = readArticles.filter((article) => {
    const readAt = article.readAt ? new Date(article.readAt) : null;
    return readAt && !Number.isNaN(readAt.getTime()) && readAt >= monday;
  }).length;
  let streak = 0;
  const streakCursor = new Date(today);
  if (!completionDays.has(localDateKey(streakCursor))) streakCursor.setDate(streakCursor.getDate() - 1);
  while (completionDays.has(localDateKey(streakCursor))) {
    streak += 1;
    streakCursor.setDate(streakCursor.getDate() - 1);
  }
  const nextLevel = readingMilestones.find((level) => level.count > readCount)
    ?? { count: Math.ceil((readCount + 1) / 50) * 50, title: "继续累积", mark: "✦" };
  const latestLevel = [...readingMilestones].reverse().find((level) => level.count <= readCount);
  const milestoneProgress = Math.min(100, Math.round((readCount / Math.max(1, nextLevel.count)) * 100));
  return { readCount, weekCount, weekDays, streak, nextLevel, latestLevel, milestoneProgress };
}

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
  const [requestedArticleId, setRequestedArticleId] = useState(initialArticleId);
  const [achievement, setAchievement] = useState<{ count: number; title: string; unlocked: boolean } | null>(null);
  const journey = readingJourney(pageArticles);
  const recentReading = [...pageArticles]
    .filter((article) => article.readingStatus === "reading" && article.readingActivityAt)
    .sort((left, right) => (right.readingActivityAt ?? "").localeCompare(left.readingActivityAt ?? ""))
    .slice(0, 2);
  const waitingArticles = [...pageArticles]
    .filter((article) => article.inReadingList)
    .sort((left, right) => (right.readingListAddedAt ?? "").localeCompare(left.readingListAddedAt ?? ""));

  useEffect(() => {
    if (!achievement) return;
    const timer = window.setTimeout(() => setAchievement(null), 4_200);
    return () => window.clearTimeout(timer);
  }, [achievement]);

  function addImportedArticle(article: ReaderArticle) {
    setPageArticles((current) => {
      const existing = current.find((item) => item.id === article.id);
      return [
        existing ?? article,
        ...current.filter((item) => item.id !== article.id),
      ];
    });
    setRequestedArticleId(article.id);
    setImporterOpen(false);
  }

  function updateReadStatus(articleId: number, isRead: boolean, readAt: string | null) {
    const previousArticle = pageArticles.find((article) => article.id === articleId);
    const newlyCompleted = isRead && previousArticle?.isRead !== true;
    setPageArticles((current) => current.map((article) => article.id === articleId
      ? {
          ...article,
          isRead,
          readAt,
          readingStatus: isRead
            ? "read"
            : article.savedAnnotations.length > 0 || article.lastReadPage ? "reading" : "unread",
        }
      : article));
    if (newlyCompleted) {
      const nextCount = pageArticles.filter((article) => article.isRead).length + 1;
      const unlockedLevel = readingMilestones.find((level) => level.count === nextCount);
      const weeklyGoalUnlocked = journey.weekCount === 2;
      setAchievement({
        count: nextCount,
        title: unlockedLevel?.title ?? (weeklyGoalUnlocked ? "本周目标达成" : "又完成了一篇"),
        unlocked: Boolean(unlockedLevel) || weeklyGoalUnlocked,
      });
    }
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

      <section className="reading-journey" aria-label="我的阅读成就">
        <header>
          <div><span>MY READING JOURNEY</span><h2>我的阅读旅程</h2></div>
          <strong>{journey.latestLevel ? `${journey.latestLevel.mark} ${journey.latestLevel.title}` : "从第一篇开始"}</strong>
        </header>
        <div className="reading-journey-body">
          <div
            className="reading-journey-ring"
            style={{ "--journey-progress": `${journey.milestoneProgress * 3.6}deg` } as CSSProperties}
          >
            <div><strong>{journey.readCount}</strong><span>篇已读</span></div>
          </div>
          <div className="reading-journey-next">
            <span>下一个里程碑</span>
            <strong>{journey.nextLevel.mark} {journey.nextLevel.count} 篇 · {journey.nextLevel.title}</strong>
            <small>再读 {Math.max(0, journey.nextLevel.count - journey.readCount)} 篇就能解锁</small>
          </div>
          <div className="reading-journey-number"><span>本周完成</span><strong>{journey.weekCount}<small> / 3 篇</small></strong><em>{journey.weekCount >= 3 ? "本周目标已达成" : "轻松读，慢慢积累"}</em></div>
          <div className="reading-journey-number"><span>连续完成</span><strong>{journey.streak}<small> 天</small></strong><em>{journey.streak > 0 ? "保持你的阅读节奏" : "今天读完一篇吧"}</em></div>
        </div>
        <footer aria-label="本周阅读足迹">
          <span>本周足迹</span>
          {journey.weekDays.map((day) => <i className={day.active ? "active" : ""} key={day.key} title={day.key}>{day.label}</i>)}
        </footer>
      </section>

      <section className="best-reading recent-reading">
        <div className="list-title"><h2>最近在读</h2><span>我的最近 2 篇</span></div>
        {recentReading.length > 0 ? (
          <div className="best-reading-grid">
            {recentReading.map((article) => (
              <a href={`/reviews/new?article=${article.id}`} key={article.id}>
                <span>我的在读</span>
                <h3>{article.title}</h3>
                <p>
                  {article.lastReadPage
                    ? `书签在第 ${article.lastReadPage} 页`
                    : "已添加批注"}
                  {article.savedAnnotations.length > 0 && ` · ${article.savedAnnotations.length} 条批注`}
                </p>
              </a>
            ))}
          </div>
        ) : <div className="empty compact"><h3>还没有在读文章</h3><p>添加批注或书签后会显示在这里。</p></div>}
      </section>

      <section className="waiting-reading">
        <div className="list-title">
          <h2>待读文章</h2>
          <span>我的待读 · {waitingArticles.length} 篇</span>
        </div>
        {waitingArticles.length > 0 ? (
          <div className="waiting-reading-grid">
            {waitingArticles.map((article) => (
              <article key={article.id}>
                <a href={`/reviews/new?article=${article.id}`}>
                  <span>待读</span>
                  <h3>{article.title}</h3>
                  <p>{article.publisher !== "机构待补充" && article.publisher.toLocaleLowerCase() !== "arxiv"
                    ? article.publisher
                    : article.tags.slice(0, 2).join(" · ")}</p>
                </a>
                <ReadingListButton
                  articleId={article.id}
                  initialSaved
                  onChange={(inReadingList, createdAt) => {
                    setPageArticles((current) => current.map((item) => item.id === article.id
                      ? { ...item, inReadingList, readingListAddedAt: createdAt }
                      : item));
                  }}
                  savedLabel="取消待读"
                />
              </article>
            ))}
          </div>
        ) : <div className="empty compact"><h3>还没有待读文章</h3><p>在文章库中点击“加入待读”，它会出现在这里。</p></div>}
      </section>

      <ReviewComposer
        articles={pageArticles}
        initialArticleId={requestedArticleId}
        initialPartnerNoteReviewId={initialPartnerNoteReviewId}
        startFocused={startFocused}
        translationEnabled={translationEnabled}
        username={username}
        onReadingListChange={(articleId, inReadingList, createdAt) => {
          setPageArticles((current) => current.map((article) => article.id === articleId
            ? { ...article, inReadingList, readingListAddedAt: createdAt }
            : article));
        }}
        onReadStatusChange={updateReadStatus}
      />
      {achievement && (
        <div className={`reading-achievement-toast${achievement.unlocked ? " unlocked" : ""}`} role="status">
          <i aria-hidden="true">{achievement.unlocked ? "✦" : "✓"}</i>
          <div><strong>{achievement.title}</strong><span>你已经读完 {achievement.count} 篇文章</span></div>
          <button aria-label="关闭成就提示" onClick={() => setAchievement(null)} type="button">×</button>
        </div>
      )}
    </KnowledgePage>
  );
}
