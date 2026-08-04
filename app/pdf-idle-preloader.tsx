"use client";

import { useEffect } from "react";

type NetworkInformation = {
  effectiveType?: string;
  saveData?: boolean;
};

export function PdfIdlePreloader() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;
    let idleHandle: number | undefined;
    let timer: ReturnType<typeof globalThis.setTimeout> | undefined;

    const start = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
      if (connection?.saveData || connection?.effectiveType === "slow-2g" || connection?.effectiveType === "2g") {
        return;
      }

      try {
        await navigator.serviceWorker.register("/pdf-cache-worker.js", { scope: "/" });
        const registration = await navigator.serviceWorker.ready;
        await navigator.storage?.persist?.().catch(() => false);
        const response = await fetch("/api/articles/prefetch", { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const data = await response.json() as { urls?: string[] };
        const worker = registration.active ?? registration.waiting ?? registration.installing;
        if (worker && data.urls?.length) {
          worker.postMessage({ type: "PREFETCH_PDFS", urls: data.urls });
        }
      } catch {
        // 预加载是后台优化，不影响正常页面与阅读器使用。
      }
    };

    const schedule = () => {
      if ("requestIdleCallback" in window) {
        idleHandle = window.requestIdleCallback(() => void start(), { timeout: 4_000 });
      } else {
        timer = globalThis.setTimeout(() => void start(), 2_000);
      }
    };

    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener("load", schedule);
      if (idleHandle !== undefined && "cancelIdleCallback" in window) window.cancelIdleCallback(idleHandle);
      if (timer !== undefined) globalThis.clearTimeout(timer);
    };
  }, []);

  return null;
}
