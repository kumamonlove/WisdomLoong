"use client";

import { useEffect, useState } from "react";
import { embodiedAiFacts } from "@/lib/embodied-ai-facts";

export function LoadingKnowledge({ compact = false }: { compact?: boolean }) {
  const [factIndex, setFactIndex] = useState(0);

  useEffect(() => {
    const random = new Uint32Array(1);
    window.crypto.getRandomValues(random);
    setFactIndex(random[0] % embodiedAiFacts.length);
  }, []);

  const fact = embodiedAiFacts[factIndex];
  return (
    <aside className={`loading-knowledge${compact ? " is-compact" : ""}`}>
      <div className="loading-knowledge-heading">
        <span>等待时间 · 具身智能冷知识</span>
        <strong>{fact.name}</strong>
      </div>
      <p>{fact.fact}</p>
      <div className="loading-knowledge-profile">
        <span>人物介绍</span>
        <p>{fact.profile}</p>
      </div>
      <a href={fact.sourceUrl} rel="noreferrer" target="_blank">来源：{fact.source} ↗</a>
    </aside>
  );
}
