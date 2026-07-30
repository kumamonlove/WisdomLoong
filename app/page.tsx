import { ArticleGrid, KnowledgePage } from "@/app/knowledge-page";
import { requireUser } from "@/lib/auth";
import { getRecommendedArticles } from "@/lib/knowledge";

export default async function Home() {
  const user = await requireUser();
  const articles = await getRecommendedArticles(user.id);

  return (
    <KnowledgePage
      page="recommended"
      title="推荐阅读"
      description="来自团队成员的高分评论与值得一读的文章"
      username={user.username}
    >
      <section className="list">
        <div className="list-title">
          <h2>高分评论</h2>
          <span>{articles.length} 篇</span>
        </div>
        <ArticleGrid
          articles={articles}
          emptyTitle="还没有推荐内容"
          emptyDescription="其他成员发表高分评论后，文章会出现在这里。"
        />
      </section>
    </KnowledgePage>
  );
}
