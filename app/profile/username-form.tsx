"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function UsernameForm({ username }: { username: string }) {
  const router = useRouter();
  const [value, setValue] = useState(username);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/username", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: value }),
      });
      const data = (await response.json()) as { username?: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? "修改失败");
      setValue(data.username ?? value.trim());
      setMessage("用户名已更新");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "修改失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="username-settings" onSubmit={submit}>
      <div><span>账号设置</span><strong>修改用户名</strong><small>新用户名也将用于下次登录</small></div>
      <label>
        <span className="visually-hidden">新用户名</span>
        <input maxLength={32} minLength={2} onChange={(event) => setValue(event.target.value)} required value={value} />
      </label>
      <button disabled={busy || value.trim() === username} type="submit">{busy ? "保存中…" : "保存用户名"}</button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
