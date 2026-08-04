"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";

export function DashboardRefresh() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [lastRefresh, setLastRefresh] = useState(() => new Date());

  const refresh = useCallback(() => {
    startTransition(() => {
      router.refresh();
      setLastRefresh(new Date());
    });
  }, [router]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 20_000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refresh]);

  return (
    <div className="admin-refresh">
      <span>{isPending ? "正在读取最新数据…" : `自动刷新 · ${lastRefresh.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`}</span>
      <button disabled={isPending} onClick={refresh} type="button">
        <i aria-hidden="true">↻</i>{isPending ? "刷新中" : "立即刷新"}
      </button>
    </div>
  );
}
