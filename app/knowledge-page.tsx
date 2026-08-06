import packageInfo from "@/package.json";
import { SiteHeader, type PageName } from "@/app/site-header";
import { ReadingNoteLikeButton } from "@/app/review-actions";
import { MarkReadButton } from "@/app/reading-actions";
import { MathTitle } from "@/app/math-title";
import { ArticleMetadataEditor } from "@/app/article-metadata-editor";
import type { ArticleCardData } from "@/lib/knowledge";

const appVersion = `v${packageInfo.version}`;

export function ArticleGrid({
  articles,
  emptyTitle,
  emptyDescription,
  showReadAction = false,
  variant = "default",
}: {
  articles: ArticleCardData[];
  emptyTitle: string;
  emptyDescription: string;
  showReadAction?: boolean;
  variant?: "default" | "team-reading";
}) {
  if (articles.length === 0) {
    return (
      <div className="empty">
        <span>01</span>
        <h3>{emptyTitle}</h3>
        <p>{emptyDescription}</p>
      </div>
    );
  }

  return (
    <div className={`article-grid${variant === "team-reading" ? " is-team-reading" : ""}`}>
      {articles.map((article) => (
        <article
          className={`article-card${article.mustRead || article.recommendationSignals?.mustReadCount ? " must-read-card" : ""}${showReadAction && article.isRead ? " is-read" : ""}`}
          key={article.id}
        >
          <div className="article-card-topline">
            <div className="card-tags">
              {(article.tags?.length ? article.tags : [article.category]).map((tag) => (
                <span className="tag" key={tag}>{tag}</span>
              ))}
            </div>
            {article.mustRead || article.recommendationSignals?.mustReadCount ? (
              <span className="must-read-rating" aria-label="必读，优先于五星推荐">
                ✦ 必读
              </span>
            ) : article.rating !== null && (
              <span className="rating" aria-label={`评分 ${article.rating}`}>
                ★ {article.rating}
              </span>
            )}
          </div>
          <h3>
            <a href={`/reviews/new?article=${article.id}`}>
              <MathTitle title={article.title} />
            </a>
          </h3>
          {article.recommendationSignals && (
            <div className="recommendation-hooks">
              {article.recommendationSignals.readCount > 0 && (
                <span className="primary-hook">
                  <i aria-hidden="true">◉</i>
                  已有 {article.recommendationSignals.readCount} 位成员读过
                </span>
              )}
              {article.recommendationSignals.mustReadCount > 0 && (
                <span><i aria-hidden="true">✦</i>{article.recommendationSignals.mustReadCount} 人标记必读</span>
              )}
              {article.recommendationSignals.longReviewCount > 0 && (
                <span><i aria-hidden="true">¶</i>包含 {article.recommendationSignals.longReviewCount} 篇评论</span>
              )}
              {article.recommendationSignals.likeCount > 0 && (
                <span><i aria-hidden="true">♥</i>读书笔记获得 {article.recommendationSignals.likeCount} 个赞</span>
              )}
              {article.rating !== null && (
                <span><i aria-hidden="true">★</i>团队评分 {article.rating}</span>
              )}
            </div>
          )}
          <dl className="article-meta">
            <div>
              <dt>论文日期</dt>
              <dd>
                {article.publishedAt
                  ? new Intl.DateTimeFormat("zh-CN").format(
                      new Date(`${article.publishedAt}T00:00:00`),
                    )
                  : "暂无"}
              </dd>
            </div>
            <div>
              <dt>研究类型</dt>
              <dd>{(article.tags?.length ? article.tags : [article.category]).join(" · ")}</dd>
            </div>
            {article.publisher &&
              article.publisher !== "机构待补充" &&
              article.publisher.toLocaleLowerCase() !== "arxiv" && (
                <div>
                  <dt>发布机构</dt>
                  <dd>{article.publisher}</dd>
                </div>
              )}
          </dl>
          <ArticleMetadataEditor
            articleId={article.id}
            initialPublishedAt={article.publishedAt}
            initialPublisher={article.publisher ?? "机构待补充"}
            initialTags={article.tags?.length ? article.tags : [article.category]}
          />
          {article.reviews && article.reviews.length > 0 ? (
            <div className="review-collection">
              <div className="review-collection-heading">
                <strong>{article.reviews.length} 位成员的评论</strong>
                <span>成员观点</span>
              </div>
              {article.reviews.map((review) => (
                <details className="long-review" key={review.id}>
                  <summary>
                    <span className="mini-avatar" aria-hidden="true">
                      {review.author.slice(0, 1).toUpperCase()}
                    </span>
                    <strong>{review.author}</strong>
                    {review.mustRead
                      ? <em className="must-read-badge">✦ 必读</em>
                      : <span>★ {review.rating}</span>}
                    <small>{review.content.length} 字评论</small>
                  </summary>
                  <div>
                    <p>{review.content}</p>
                    {review.attachments.length > 0 && (
                      <div className="review-attachments">
                        {review.attachments.map((attachment) => (
                          <figure key={attachment.id}>
                            <img
                              alt={attachment.note || `${review.author} 的论文截图`}
                              loading="lazy"
                              src={`/api/review-attachments/${attachment.id}`}
                            />
                            {attachment.note && <figcaption>{attachment.note}</figcaption>}
                          </figure>
                        ))}
                      </div>
                    )}
                    {review.noteFileName && (
                      <div className="reading-note-actions">
                        <a href={`/reviews/new?article=${article.id}&note=${review.id}`}>在阅读器打开读书笔记</a>
                        <ReadingNoteLikeButton
                        initialCount={review.likeCount}
                        initiallyLiked={review.likedByViewer}
                        reviewId={review.id}
                        />
                      </div>
                    )}
                  </div>
                </details>
              ))}
            </div>
          ) : article.reviewAuthor ? (
            <a
              className="review-preview"
              href={`/reviews/new?article=${article.id}${article.reviewId ? `&note=${article.reviewId}` : ""}`}
            >
              <p>
                <span className="mini-avatar" aria-hidden="true">
                  {article.reviewAuthor.slice(0, 1).toUpperCase()}
                </span>
                <strong>{article.reviewAuthor}</strong> 的评论
              </p>
              {article.reviewContent && <blockquote>{article.reviewContent}</blockquote>}
              <span className="review-preview-open">在阅读器打开 <i aria-hidden="true">↗</i></span>
            </a>
          ) : null}
          <div className="article-card-actions">
            <a
              className="article-link"
              href={`/reviews/new?article=${article.id}`}
            >
              {showReadAction && article.isRead ? "重新阅读" : "开始阅读"} <span aria-hidden="true">→</span>
            </a>
            {showReadAction && <MarkReadButton articleId={article.id} initialRead={article.isRead} />}
          </div>
        </article>
      ))}
    </div>
  );
}

export function KnowledgePage({
  page,
  username,
  eyebrow = "WISDOMLOONG KNOWLEDGE LIBRARY",
  title,
  titleSuffix,
  description,
  action,
  children,
}: {
  page: PageName;
  username: string;
  eyebrow?: string;
  title: string;
  titleSuffix?: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="site">
      <SiteHeader page={page} username={username} />
      <main>
        <section className="heading">
          <div>
            <p>{eyebrow}</p>
            <h1>{title}{titleSuffix && <small className="heading-title-suffix">{titleSuffix}</small>}</h1>
            <span>{description}</span>
          </div>
          {action}
        </section>
        {children}
      </main>
      <footer id="footer">
        <span>WisdomLoong · 仅供算法组内部交流学习使用</span>
        <span>{appVersion}</span>
      </footer>
    </div>
  );
}
