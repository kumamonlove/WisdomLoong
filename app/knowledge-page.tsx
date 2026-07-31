import packageInfo from "@/package.json";
import { SiteHeader, type PageName } from "@/app/site-header";
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
          <dl className="article-meta">
            <div>
              <dt>发布时间</dt>
              <dd>
                {article.publishedAt
                  ? new Intl.DateTimeFormat("zh-CN").format(
                      new Date(`${article.publishedAt}T00:00:00`),
                    )
                  : "暂无"}
              </dd>
            </div>
            <div>
              <dt>发布机构</dt>
              <dd>{article.publisher}</dd>
            </div>
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
                    {review.attachmentIds.length > 0 && (
                      <div className="review-attachments">
                        {review.attachmentIds.map((id) => (
                          <img
                            alt={`${review.author} 的论文截图`}
                            key={id}
                            loading="lazy"
                            src={`/api/review-attachments/${id}`}
                          />
                        ))}
                      </div>
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
