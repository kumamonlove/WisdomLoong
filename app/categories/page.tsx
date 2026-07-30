import { ArticleGrid, KnowledgePage } from "@/app/knowledge-page";
import { requireUser } from "@/lib/auth";
import {
  categories,
  getCategoryArticles,
  getCategoryCounts,
  parseCategory,
  parseReviewFilter,
  parseSort,
  type Category,
  type ReviewFilter,
  type SortOrder,
} from "@/lib/knowledge";

type CategoriesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function categoryHref(
  category: Category,
  reviewFilter: ReviewFilter,
  sort: SortOrder,
) {
  const params = new URLSearchParams();
  if (category !== "全部") params.set("category", category);
  if (reviewFilter !== "all") params.set("review", reviewFilter);
  if (sort !== "newest") params.set("sort", sort);
  const query = params.toString();
  return query ? `/categories?${query}` : "/categories";
}

export default async function CategoriesPage({
  searchParams,
}: CategoriesPageProps) {
  const [params, user] = await Promise.all([searchParams, requireUser()]);
  const category = parseCategory(params.category);
  const reviewFilter = parseReviewFilter(params.review);
  const sort = parseSort(params.sort);
  const [articles, counts] = await Promise.all([
    getCategoryArticles({ userId: user.id, category, reviewFilter, sort }),
    getCategoryCounts(),
  ]);
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);

  return (
    <KnowledgePage
      page="categories"
      title="知识分类"
      description="按研究方向整理团队导入并评论过的文章"
      username={user.username}
    >
      <section className="categories">
        {categories.map((item) => (
          <a
            className={category === item ? "selected" : ""}
            href={categoryHref(item, reviewFilter, sort)}
            key={item}
          >
            <span>{item === "全部" ? "ALL" : item}</span>
            <small>{item === "全部" ? total : (counts.get(item) ?? 0)} 篇</small>
          </a>
        ))}
      </section>

      <section className="list">
        <div className="list-toolbar">
          <div className="list-title">
            <h2>{category === "全部" ? "全部文章" : category}</h2>
            <span>{articles.length} 篇</span>
          </div>
          <form className="filter-form" method="get">
            {category !== "全部" && (
              <input name="category" type="hidden" value={category} />
            )}
            <label>
              评论
              <select defaultValue={reviewFilter} name="review">
                <option value="all">全部</option>
                <option value="reviewed">我已评论</option>
                <option value="unreviewed">我未评论</option>
              </select>
            </label>
            <label>
              排序
              <select defaultValue={sort} name="sort">
                <option value="newest">时间从新到旧</option>
                <option value="oldest">时间从旧到新</option>
                <option value="rating">评分从高到低</option>
              </select>
            </label>
            <button type="submit">筛选</button>
          </form>
        </div>
        <ArticleGrid
          articles={articles}
          emptyTitle="没有符合条件的文章"
          emptyDescription="可前往“待读文章”导入，或调整当前筛选条件。"
        />
      </section>
    </KnowledgePage>
  );
}
