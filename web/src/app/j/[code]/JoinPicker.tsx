"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type StudentRow = {
  id: string;
  fullName: string;
  anonToken: string;
  workspaceId: string;
};

export function JoinPicker({
  sessionCode,
  students,
}: {
  sessionCode: string;
  students: StudentRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const filtered = filter.trim()
    ? students.filter((s) =>
        s.fullName.toLowerCase().includes(filter.trim().toLowerCase()),
      )
    : students;

  const pick = async (s: StudentRow) => {
    setBusy(s.id);
    // сохраняем токен в localStorage — потом холст будет его использовать
    try {
      localStorage.setItem(`parta:student:${sessionCode}`, s.anonToken);
      localStorage.setItem(`parta:studentId:${sessionCode}`, s.id);
    } catch {
      // приватные режимы могут запрещать localStorage — игнорируем
    }
    // помечаем у себя факт входа
    try {
      await fetch(`/api/workspaces/${s.workspaceId}/join`, {
        method: "POST",
        headers: { "x-anon-token": s.anonToken },
      });
    } catch {
      // безразлично — у учителя status обновится при следующем штрихе
    }
    router.push(`/s/${s.workspaceId}`);
  };

  return (
    <div>
      {students.length > 12 && (
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Найти себя…"
          className="w-full mb-3 px-3 py-2.5 rounded-lg border border-rule bg-paper outline-none focus:border-accent transition"
        />
      )}
      <div className="grid sm:grid-cols-2 gap-2">
        {filtered.map((s) => (
          <button
            key={s.id}
            onClick={() => pick(s)}
            disabled={busy === s.id}
            className="text-left px-4 py-3 rounded-xl bg-paper border border-rule hover:border-accent hover:bg-chalk transition disabled:opacity-60 font-medium"
          >
            {busy === s.id ? "Открываем…" : s.fullName}
          </button>
        ))}
      </div>
    </div>
  );
}
