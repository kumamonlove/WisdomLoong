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
        <article className="article-card" key={`${article.id}-${article.reviewAuthor ?? ""}`}>
          <div className="article-card-topline">
            <span className="tag">{article.category}</span>
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
          {article.reviewAuthor && (
            <div className="review-preview">
              <p>
                <span className="mini-avatar" aria-hidden="true">
                  {article.reviewAuthor.slice(0, 1).toUpperCase()}
                </span>
                <strong>{article.reviewAuthor}</strong> 的评论
              </p>
              {article.reviewContent && <blockquote>{article.reviewContent}</blockquote>}
            </div>
          )}
          <a
            className="article-link"
            href={article.sourceUrl}
            rel="noreferrer"
            target="_blank"
          >
            阅读原文 <span aria-hidden="true">↗</span>
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
