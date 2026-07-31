import packageInfo from "@/package.json";
import { SiteHeader, type PageName } from "@/app/site-header";
import { ReviewLikeButton } from "@/app/review-actions";
import type { ArticleCardData } from "@/lib/knowledge";

const appVersion = `v${packageInfo.version}`;

export function ArticleGrid({
  articles,
  emptyTitle,
  emptyDescription,
}: {
  articles: ArticleCardData[];
  emptyTitle: string;
  emptyDescription: string;
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
    <div className="article-grid">
      {articles.map((article) => (
        <article className="article-card" key={article.id}>
          <div className="article-card-topline">
            <div className="card-tags">
              {(article.tags?.length ? article.tags : [article.category]).map((tag) => (
                <span className="tag" key={tag}>{tag}</span>
              ))}
            </div>
            {article.rating !== null && (
              <span className="rating" aria-label={`评分 ${article.rating}`}>
                ★ {article.rating}
              </span>
            )}
          </div>
          <h3>
            <a href={article.sourceUrl} rel="noreferrer" target="_blank">
              {article.title}
            </a>
          </h3>
          {article.recommendationSignals && (
            <div className="recommendation-hooks">
              {article.recommendationSignals.reviewerCount > 0 && (
                <span className="primary-hook">
                  <i aria-hidden="true">◉</i>
                  已有 {article.recommendationSignals.reviewerCount} 位成员读过并留下判断
                </span>
              )}
              {article.recommendationSignals.mustReadCount > 0 && (
                <span><i aria-hidden="true">✦</i>{article.recommendationSignals.mustReadCount} 人标记必读</span>
              )}
              {article.recommendationSignals.longReviewCount > 0 && (
                <span><i aria-hidden="true">¶</i>包含 {article.recommendationSignals.longReviewCount} 篇深度解读</span>
              )}
              {article.recommendationSignals.likeCount > 0 && (
                <span><i aria-hidden="true">♥</i>长评获得 {article.recommendationSignals.likeCount} 个赞同</span>
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
          {article.reviews && article.reviews.length > 0 ? (
            <div className="review-collection">
              <div className="review-collection-heading">
                <strong>{article.reviews.length} 位成员的评论</strong>
                <span>长评论优先</span>
              </div>
              {article.reviews.map((review) => (
                <details className="long-review" key={review.id}>
                  <summary>
                    <span className="mini-avatar" aria-hidden="true">
                      {review.author.slice(0, 1).toUpperCase()}
                    </span>
                    <strong>{review.author}</strong>
                    <span>★ {review.rating}</span>
                    {review.mustRead && <em className="must-read-badge">✦ 必读</em>}
                    <small>{review.reviewType === "short" ? "短评" : `${review.content.length} 字长评`}</small>
                  </summary>
                  <div>
                    <p>{review.content}</p>
                    {review.annotations.length > 0 && (
                      <div className="shared-annotations">
                        <h4>逐页批注</h4>
                        {review.annotations.map((annotation) => (
                          <article key={annotation.id}>
                            <strong>P.{annotation.page}</strong>
                            {annotation.quote && <blockquote>{annotation.quote}</blockquote>}
                            {annotation.translation && <p className="annotation-translation">{annotation.translation}</p>}
                            <p>{annotation.content}</p>
                          </article>
                        ))}
                      </div>
                    )}
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
                    {review.reviewType === "long" && (
                      <ReviewLikeButton
                        initialCount={review.likeCount}
                        initiallyLiked={review.likedByViewer}
                        reviewId={review.id}
                      />
                    )}
                  </div>
                </details>
              ))}
            </div>
          ) : article.reviewAuthor ? (
            <div className="review-preview">
              <p>
                <span className="mini-avatar" aria-hidden="true">
                  {article.reviewAuthor.slice(0, 1).toUpperCase()}
                </span>
                <strong>{article.reviewAuthor}</strong> 的评论
              </p>
              {article.reviewContent && <blockquote>{article.reviewContent}</blockquote>}
            </div>
          ) : null}
          <a
            className="article-link"
            href={`/reviews/new?article=${article.id}`}
          >
            在阅读器中打开 <span aria-hidden="true">→</span>
          </a>
        </article>
      ))}
    </div>
  );
}

export function KnowledgePage({
  page,
  username,
  eyebrow = "ROBOTICS KNOWLEDGE HUB",
  title,
  description,
  action,
  children,
}: {
  page: PageName;
  username: string;
  eyebrow?: string;
  title: string;
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
            <h1>{title}</h1>
            <span>{description}</span>
          </div>
          {action}
        </section>
        {children}
      </main>
      <footer id="footer">
        <span>WisdomLoong · 目前仅供算法组内部交流学习使用</span>
        <span>{appVersion}</span>
      </footer>
    </div>
  );
}
