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
      title="待读文章"
      description="保存你想读、但还没来得及读的文章"
      username={user.username}
    >
      <section className="import-section">
        <div className="section-heading">
          <span>IMPORT FROM ARXIV</span>
          <h2>导入文章</h2>
          <p>输入文章名，自动获取基本信息与原文链接，并加入你的个人待读清单。</p>
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
          emptyTitle="待读清单是空的"
          emptyDescription="在上方输入 arXiv 文章名，把想读的内容先保存下来。"
          showReadAction
        />
      </section>
    </KnowledgePage>
  );
}
