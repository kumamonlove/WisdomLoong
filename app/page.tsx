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
      description="团队成员读过、讨论并认为值得关注的文章"
      username={user.username}
    >
      <section className="list">
        <div className="list-title">
          <h2>大家在读</h2>
          <span>{articles.length} 篇</span>
        </div>
        <ArticleGrid
          articles={articles}
          emptyTitle="还没有推荐内容"
          emptyDescription="团队成员阅读、批注或推荐文章后，内容会出现在这里。"
        />
      </section>
    </KnowledgePage>
  );
}
