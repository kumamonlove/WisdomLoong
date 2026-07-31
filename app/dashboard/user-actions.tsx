"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteUserButton({
  userId,
  username,
}: {
  userId: number;
  username: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function deleteUser() {
    if (!window.confirm(`确定删除用户“${username}”吗？其个人评论、阅读记录和登录会话将一并删除。`)) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/dashboard/users/${userId}`, { method: "DELETE" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "删除失败");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除失败");
      setBusy(false);
    }
  }

  return (
    <div className="admin-user-action">
      <button
        className="admin-delete-user"
        disabled={busy}
        onClick={deleteUser}
        type="button"
      >
        {busy ? "删除中…" : "删除用户"}
      </button>
      {error && <small role="alert">{error}</small>}
    </div>
  );
}
