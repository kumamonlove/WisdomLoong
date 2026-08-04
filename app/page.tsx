import { ArticleGrid, KnowledgePage } from "@/app/knowledge-page";
import { requireUser } from "@/lib/auth";
import { getRecentlyReadArticles, getTeamReadingArticles } from "@/lib/knowledge";

export default async function Home() {
  const user = await requireUser();
  const [articles, recentlyRead] = await Promise.all([
    getTeamReadingArticles(),
    getRecentlyReadArticles(user.id),
  ]);

  return (
    <KnowledgePage
      page="recommended"
      title="阅读动态"
      description="了解团队正在关注的内容，快速回到你最近阅读的文章"
      username={user.username}
    >
      <section className="list">
        <div className="list-title">
          <h2>大家在读</h2>
          <span>{articles.length} 篇</span>
        </div>
        <ArticleGrid
          articles={articles}
          emptyTitle="还没有团队阅读动态"
          emptyDescription="团队成员进入论文阅读器后，文章会出现在这里。"
        />
      </section>

      <section className="list">
        <div className="list-title">
          <h2>最近阅读</h2>
          <span>{recentlyRead.length} 篇</span>
        </div>
        <ArticleGrid
          articles={recentlyRead}
          emptyTitle="还没有最近阅读"
          emptyDescription="从“阅读文章”进入论文阅读器后，会自动记录在这里。"
        />
      </section>
    </KnowledgePage>
  );
}
