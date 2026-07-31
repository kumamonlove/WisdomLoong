import { ReadingListImporter } from "@/app/article-workflows";
import { ArticleGrid, KnowledgePage } from "@/app/knowledge-page";
import { requireUser } from "@/lib/auth";
import { getReadingList } from "@/lib/knowledge";

export default async function ReadingListPage() {
  const user = await requireUser();
  const articles = await getReadingList(user.id);

  return (
    <KnowledgePage
      page="reading"
      title="待读列表"
      description="团队文章库中你尚未读过或评论的文章；上传或推荐不等于已经读过"
      username={user.username}
    >
      <section className="import-section" id="recommend-article">
        <div className="section-heading">
          <span>ADD TO TEAM LIBRARY</span>
          <h2>推荐值得一读的文章</h2>
          <p>从 arXiv 获取，或拖入本地 PDF；添加后全团队都能在阅读器中查看。</p>
        </div>
        <ReadingListImporter />
      </section>

      <section className="list">
        <div className="list-title">
          <h2>我的待读</h2>
          <span>{articles.length} 篇</span>
        </div>
        <ArticleGrid
          articles={articles}
          emptyTitle="待读列表是空的"
          emptyDescription="团队导入新文章后，会自动出现在这里。"
          showReadAction
        />
      </section>
    </KnowledgePage>
  );
}
