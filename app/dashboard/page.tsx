import packageInfo from "@/package.json";
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

export default async function DashboardPage() {
  await requireAdmin();
  const result = await database.query<UserOverview>(
    `SELECT
       users.id,
       users.username,
       users.created_at::text AS "createdAt",
       COUNT(DISTINCT reviews.id)::int AS "reviewCount",
       COUNT(DISTINCT reading_list.article_id)::int AS "readingCount",
       GREATEST(MAX(reviews.updated_at), MAX(sessions.created_at))::text AS "lastActiveAt"
     FROM users
     LEFT JOIN reviews ON reviews.user_id = users.id
     LEFT JOIN reading_list ON reading_list.user_id = users.id
     LEFT JOIN sessions ON sessions.user_id = users.id
     GROUP BY users.id
     ORDER BY users.created_at DESC`,
  );
  const totalReviews = result.rows.reduce((sum, user) => sum + user.reviewCount, 0);

  return (
    <div className="admin-dashboard">
      <header>
        <a href="/dashboard">WISDOM/OONG <span>ADMIN</span></a>
        <form action="/api/dashboard/logout" method="post"><button>退出后台</button></form>
      </header>
      <main>
        <div className="admin-heading">
          <div><p>USER OVERVIEW</p><h1>当前用户情况</h1></div>
          <span>数据实时读取</span>
        </div>
        <section className="admin-stats">
          <div><span>注册用户</span><strong>{result.rows.length}</strong></div>
          <div><span>已发布评论</span><strong>{totalReviews}</strong></div>
        </section>
        <section className="admin-user-table">
          <div className="admin-table-row heading-row">
            <span>用户</span><span>注册时间</span><span>评论</span><span>待读</span><span>最后活跃</span><span>管理</span>
          </div>
          {result.rows.map((user) => (
            <div className="admin-table-row" key={user.id}>
              <strong><i>{user.username.slice(0, 1).toUpperCase()}</i>{user.username}</strong>
              <span>{new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(user.createdAt))}</span>
              <span>{user.reviewCount}</span><span>{user.readingCount}</span>
              <span>{user.lastActiveAt ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(user.lastActiveAt)) : "暂无"}</span>
              <DeleteUserButton userId={user.id} username={user.username} />
            </div>
          ))}
        </section>
      </main>
      <footer><span>WisdomLoong 管理后台</span><span>v{packageInfo.version}</span></footer>
    </div>
  );
}
