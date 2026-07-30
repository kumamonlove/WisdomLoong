"use client";

import { useEffect, useState } from "react";

type PageName = "latest" | "categories";

function BrandW() {
  return (
    <svg
      aria-hidden="true"
      className="brand-w"
      viewBox="0 0 31 24"
    >
      <path d="M1.5 1L7.5 23L15.5 6.5L23.5 23L29.5 1" />
    </svg>
  );
}

function BrandSlash() {
  return (
    <svg
      aria-hidden="true"
      className="brand-slash"
      viewBox="0 0 8 24"
    >
      <path d="M1 23L7 1" />
    </svg>
  );
}

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
          <BrandW />
          <span aria-hidden="true" className="wordmark-tail">
            <span className="wordmark-prefix">ISDOM</span>
            <BrandSlash />
            <span className="wordmark-suffix">OONG</span>
          </span>
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
