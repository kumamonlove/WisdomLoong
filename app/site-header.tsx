"use client";

import { useEffect, useState } from "react";

type PageName = "latest" | "categories";

export function SiteHeader({ page }: { page: PageName }) {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    let frame = 0;

    const updateHeader = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setCompact(window.scrollY > 56);
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
          <span aria-hidden="true" className="wordmark-full">
            <span>WISDOM</span>
            <i className="brand-slash" />
            <span>OONG</span>
          </span>
          <i aria-hidden="true" className="brand-slash wordmark-mark" />
        </a>

        <nav aria-label="主要导航">
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
      </div>
    </header>
  );
}
