import packageInfo from "@/package.json";

type Article = {
  id: number;
  title: string;
  category: string;
  author: string;
  date: string;
  link: string;
};

type PageName = "latest" | "categories";
type Order = "newest" | "oldest";

const categories = ["全部", "VLA", "世界模型", "具身智能", "强化学习"] as const;
type Category = (typeof categories)[number];

// 先保留空数据结构，后续将这里替换为数据库内容。
const articles: Article[] = [];
const appVersion = `v${packageInfo.version}`;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseCategory(
  value: string | string[] | undefined,
): Category {
  const category = firstValue(value);
  return categories.find((item) => item === category) ?? "全部";
}

export function parseOrder(value: string | string[] | undefined): Order {
  return firstValue(value) === "oldest" ? "oldest" : "newest";
}

function categoryHref(category: Category, order: Order) {
  const params = new URLSearchParams();

  if (category !== "全部") {
    params.set("category", category);
  }

  if (order === "oldest") {
    params.set("order", order);
  }

  const query = params.toString();
  return query ? `/categories?${query}` : "/categories";
}

export function KnowledgePage({
  page,
  category,
  order,
}: {
  page: PageName;
  category: Category;
  order: Order;
}) {
  const visibleArticles = articles
    .filter((article) => category === "全部" || article.category === category)
    .sort((a, b) => {
      const difference =
        new Date(b.date).getTime() - new Date(a.date).getTime();
      return order === "newest" ? difference : -difference;
    });

  return (
    <div className="site">
      <header>
        <a className="logo" href="/">
          <span>W</span>
          <strong>WisdomLoong</strong>
        </a>

        <nav>
          <a className={page === "latest" ? "active" : ""} href="/">
            最新文章
          </a>
          <a
            className={page === "categories" ? "active" : ""}
            href="/categories"
          >
            分类
          </a>
        </nav>
      </header>

      <main>
        <section className="heading">
          <div>
            <p>ROBOTICS KNOWLEDGE HUB</p>
            <h1>{page === "latest" ? "最新文章" : "文章分类"}</h1>
            <span>共享机器人前沿论文与阅读记录</span>
          </div>

          <form className="sort-form" method="get">
            {page === "categories" && category !== "全部" && (
              <input name="category" type="hidden" value={category} />
            )}
            <label>
              时间排序
              <select defaultValue={order} name="order">
                <option value="newest">从新到旧</option>
                <option value="oldest">从旧到新</option>
              </select>
            </label>
            <button type="submit">应用</button>
          </form>
        </section>

        {page === "categories" && (
          <section className="categories">
            {categories.map((item) => (
              <a
                key={item}
                className={category === item ? "selected" : ""}
                href={categoryHref(item, order)}
              >
                <span>{item === "全部" ? "ALL" : item}</span>
                <small>
                  {
                    articles.filter(
                      (article) =>
                        item === "全部" || article.category === item,
                    ).length
                  }{" "}
                  篇
                </small>
              </a>
            ))}
          </section>
        )}

        <section className="list">
          <div className="list-title">
            <h2>{category === "全部" ? "全部文章" : category}</h2>
            <span>{visibleArticles.length} 篇</span>
          </div>

          {visibleArticles.length > 0 ? (
            visibleArticles.map((article) => (
              <a
                className="article"
                href={article.link}
                key={article.id}
                target="_blank"
                rel="noreferrer"
              >
                <span className="tag">{article.category}</span>
                <h3>{article.title}</h3>
                <p>
                  {article.author} ·{" "}
                  {new Intl.DateTimeFormat("zh-CN").format(
                    new Date(article.date),
                  )}
                </p>
              </a>
            ))
          ) : (
            <div className="empty">
              <span>01</span>
              <h3>还没有文章</h3>
              <p>页面框架已建立，后续接入团队提交的数据即可。</p>
            </div>
          )}
        </section>
      </main>

      <footer>
        <span>WisdomLoong · Shared robotics reading</span>
        <span>{appVersion}</span>
      </footer>
    </div>
  );
}
