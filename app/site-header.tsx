"use client";

import { useEffect, useState } from "react";

export type PageName = "recommended" | "categories" | "review" | "profile";

function BrandW() {
  return <span className="brand-w">W</span>;
}

function BrandSlash() {
  return <span className="brand-slash">/</span>;
}

export function SiteHeader({
  page,
  username,
}: {
  page: PageName;
  username: string;
}) {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    let frame = 0;

    const updateHeader = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setCompact((current) => current ? window.scrollY > 28 : window.scrollY > 68);
      });
    };

    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", updateHeader);
    };
  }, []);

  return (
    <header className={`site-header${compact ? " is-compact" : ""}`}>
      <div className="header-inner">
        <a aria-label="WisdomLoong 首页" className="wordmark" href="/">
          <BrandW />
          <span aria-hidden="true" className="wordmark-tail">
            <span className="wordmark-prefix">ISDOM</span>
            <BrandSlash />
            <span className="wordmark-suffix">OONG</span>
          </span>
        </a>

        <div className="header-actions">
          <nav aria-label="主要导航">
            <a className={page === "recommended" ? "active" : ""} href="/">
              阅读动态
            </a>
            <a
              className={page === "categories" ? "active" : ""}
              href="/categories"
            >
              知识分类
            </a>
          </nav>

          <a
            className={`write-review-button${page === "review" ? " active" : ""}`}
            href="/reviews/new"
          >
            阅读文章
          </a>

          <details className="account-menu">
            <summary title={username}>
              <span aria-hidden="true">{username.slice(0, 1).toUpperCase()}</span>
              <strong>{username}</strong>
            </summary>
            <div>
              <p>当前登录用户</p>
              <strong>{username}</strong>
              <a className="profile-link" href="/profile">我的主页 · 赞与用户名设置</a>
              <form
                action="/api/auth/logout"
                method="post"
              >
                <button type="submit">退出登录</button>
              </form>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
