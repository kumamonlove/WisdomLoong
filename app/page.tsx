"use client";

import { useMemo, useState } from "react";

type Article = {
  id: number;
  title: string;
  category: string;
  author: string;
  date: string;
  link: string;
};

const categories = ["全部", "VLA", "世界模型", "具身智能", "强化学习"];

// 先保留空数据结构，后续将这里替换为数据库内容。
const articles: Article[] = [];

export default function Home() {
  const [page, setPage] = useState<"latest" | "categories">("latest");
  const [category, setCategory] = useState("全部");
  const [order, setOrder] = useState<"newest" | "oldest">("newest");

  const visibleArticles = useMemo(() => {
    return articles
      .filter((article) => category === "全部" || article.category === category)
      .sort((a, b) => {
        const difference =
          new Date(b.date).getTime() - new Date(a.date).getTime();
        return order === "newest" ? difference : -difference;
      });
  }, [category, order]);

  return (
    <div className="site">
      <header>
        <button
          className="logo"
          onClick={() => {
            setPage("latest");
            setCategory("全部");
          }}
        >
          <span>W</span>
          <strong>WisdomLoong</strong>
        </button>

        <nav>
          <button
            className={page === "latest" ? "active" : ""}
            onClick={() => {
              setPage("latest");
              setCategory("全部");
            }}
          >
            最新文章
          </button>
          <button
            className={page === "categories" ? "active" : ""}
            onClick={() => setPage("categories")}
          >
            分类
          </button>
        </nav>
      </header>

      <main>
        <section className="heading">
          <div>
            <p>ROBOTICS KNOWLEDGE HUB</p>
            <h1>{page === "latest" ? "最新文章" : "文章分类"}</h1>
            <span>共享机器人前沿论文与阅读记录</span>
          </div>

          <label>
            时间排序
            <select
              value={order}
              onChange={(event) =>
                setOrder(event.target.value as "newest" | "oldest")
              }
            >
              <option value="newest">从新到旧</option>
              <option value="oldest">从旧到新</option>
            </select>
          </label>
        </section>

        {page === "categories" && (
          <section className="categories">
            {categories.map((item) => (
              <button
                key={item}
                className={category === item ? "selected" : ""}
                onClick={() => setCategory(item)}
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
              </button>
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

      <footer>WisdomLoong · Shared robotics reading</footer>
    </div>
  );
}
