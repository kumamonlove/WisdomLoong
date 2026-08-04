import packageInfo from "@/package.json";
import { DashboardRefresh } from "@/app/dashboard/dashboard-refresh";
import { DeleteUserButton } from "@/app/dashboard/user-actions";
import { requireAdmin } from "@/lib/admin-auth";
import { database } from "@/lib/db";

type UserOverview = {
  id: number;
  username: string;
  createdAt: string;
  reviewCount: number;
  readingCount: number;
  lastActiveAt: string | null;
};

type ReadingActivity = {
  userId: number;
  username: string;
  articleId: number;
  articleTitle: string;
  viewedAt: string;
  pageNumber: number | null;
  readAt: string | null;
  reviewedAt: string | null;
};

type ActivityStats = {
  activeUsers: number;
  recentReaders: number;
  recentArticles: number;
};

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Shanghai",
});

export default async function DashboardPage() {
  await requireAdmin();
  const [result, activityResult, activityStatsResult] = await Promise.all([
    database.query<UserOverview>(
    `SELECT
       users.id,
       users.username,
       users.created_at::text AS "createdAt",
       (SELECT COUNT(*)::int FROM reviews WHERE reviews.user_id = users.id) AS "reviewCount",
       (SELECT COUNT(*)::int FROM article_reads WHERE article_reads.user_id = users.id) AS "readingCount",
       GREATEST(
         (SELECT MAX(reviews.updated_at) FROM reviews WHERE reviews.user_id = users.id),
         (SELECT MAX(sessions.created_at) FROM sessions WHERE sessions.user_id = users.id),
         (SELECT MAX(article_recent_views.viewed_at) FROM article_recent_views WHERE article_recent_views.user_id = users.id),
         (SELECT MAX(reading_progress.updated_at) FROM reading_progress WHERE reading_progress.user_id = users.id)
       )::text AS "lastActiveAt"
     FROM users
     ORDER BY users.created_at DESC`),
    database.query<ReadingActivity>(
      `SELECT
         users.id AS "userId",
         users.username,
         articles.id AS "articleId",
         articles.title AS "articleTitle",
         article_recent_views.viewed_at::text AS "viewedAt",
         reading_progress.page_number AS "pageNumber",
         article_reads.read_at::text AS "readAt",
         reviews.updated_at::text AS "reviewedAt"
       FROM article_recent_views
       INNER JOIN users ON users.id = article_recent_views.user_id
       INNER JOIN articles ON articles.id = article_recent_views.article_id
       LEFT JOIN reading_progress
         ON reading_progress.user_id = article_recent_views.user_id
        AND reading_progress.article_id = article_recent_views.article_id
       LEFT JOIN article_reads
         ON article_reads.user_id = article_recent_views.user_id
        AND article_reads.article_id = article_recent_views.article_id
       LEFT JOIN reviews
         ON reviews.user_id = article_recent_views.user_id
        AND reviews.article_id = article_recent_views.article_id
       ORDER BY article_recent_views.viewed_at DESC
       LIMIT 100`),
    database.query<ActivityStats>(
      `SELECT
         COUNT(DISTINCT user_id) FILTER (WHERE viewed_at >= NOW() - INTERVAL '5 minutes')::int AS "activeUsers",
         COUNT(DISTINCT user_id) FILTER (WHERE viewed_at >= NOW() - INTERVAL '24 hours')::int AS "recentReaders",
         COUNT(DISTINCT article_id) FILTER (WHERE viewed_at >= NOW() - INTERVAL '24 hours')::int AS "recentArticles"
       FROM article_recent_views`),
  ]);
  const totalReviews = result.rows.reduce((sum, user) => sum + user.reviewCount, 0);
  const activityStats = activityStatsResult.rows[0] ?? { activeUsers: 0, recentReaders: 0, recentArticles: 0 };

  return (
    <div className="admin-dashboard">
      <header>
        <a href="/dashboard">WISDOM/OONG <span>ADMIN</span></a>
        <form action="/api/dashboard/logout" method="post"><button>退出后台</button></form>
      </header>
      <main>
        <div className="admin-heading">
          <div><p>USER OVERVIEW</p><h1>当前用户情况</h1></div>
          <DashboardRefresh />
        </div>
        <section className="admin-stats">
          <div><span>注册用户</span><strong>{result.rows.length}</strong></div>
          <div><span>已发布评论</span><strong>{totalReviews}</strong></div>
          <div><span>当前活跃 <small>5 分钟内</small></span><strong>{activityStats.activeUsers}</strong></div>
          <div><span>24 小时阅读 <small>{activityStats.recentArticles} 篇文章</small></span><strong>{activityStats.recentReaders}</strong></div>
        </section>
        <section className="admin-user-table">
          <div className="admin-table-row heading-row">
            <span>用户</span><span>注册时间</span><span>评论</span><span>已读</span><span>最后活跃</span><span>管理</span>
          </div>
          {result.rows.map((user) => (
            <div className="admin-table-row" key={user.id}>
              <strong><i>{user.username.slice(0, 1).toUpperCase()}</i>{user.username}</strong>
              <span>{new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(user.createdAt))}</span>
              <span>{user.reviewCount}</span><span>{user.readingCount}</span>
              <span>{user.lastActiveAt ? dateTimeFormatter.format(new Date(user.lastActiveAt)) : "暂无"}</span>
              <DeleteUserButton userId={user.id} username={user.username} />
            </div>
          ))}
        </section>
        <section className="admin-activity-section">
          <header>
            <div><p>READING ACTIVITY</p><h2>最近阅读明细</h2></div>
            <span>最近 100 条用户与文章记录</span>
          </header>
          <div className="admin-activity-table">
            <div className="admin-activity-row heading-row">
              <span>用户</span><span>查看的文章</span><span>阅读位置</span><span>状态</span><span>最后查看</span>
            </div>
            {activityResult.rows.map((activity) => (
              <div className="admin-activity-row" key={`${activity.userId}-${activity.articleId}`}>
                <strong><i>{activity.username.slice(0, 1).toUpperCase()}</i>{activity.username}</strong>
                <span className="admin-activity-title" title={activity.articleTitle}>{activity.articleTitle}</span>
                <span>{activity.pageNumber ? `第 ${activity.pageNumber} 页` : "尚无页码"}</span>
                <span className="admin-activity-flags">
                  {activity.readAt ? <em className="is-read">已读</em> : <em>阅读中</em>}
                  {activity.reviewedAt && <em className="is-reviewed">已评论</em>}
                </span>
                <time dateTime={activity.viewedAt}>{dateTimeFormatter.format(new Date(activity.viewedAt))}</time>
              </div>
            ))}
            {activityResult.rows.length === 0 && <p className="admin-activity-empty">还没有用户查看文章。</p>}
          </div>
        </section>
      </main>
      <footer><span>WisdomLoong 管理后台</span><span>v{packageInfo.version}</span></footer>
    </div>
  );
}
