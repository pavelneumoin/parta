"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type StudentRow = {
  id: string;
  fullName: string;
  workspaceId: string;
};

export function JoinPicker({
  credential,
  students,
}: {
  credential: string;
  students: StudentRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pin, setPin] = useState("");

  const filtered = filter.trim()
    ? students.filter((s) =>
        s.fullName.toLowerCase().includes(filter.trim().toLowerCase()),
      )
    : students;

  const selected = students.find((student) => student.id === selectedId) ?? null;

  const choose = (s: StudentRow) => {
    if (busy) return;
    if (!s.workspaceId) {
      setError("Для этого ученика ещё не создан рабочий лист. Позовите учителя.");
      return;
    }

    setSelectedId(s.id);
    setPin("");
    setError(null);
  };

  const pick = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || busy || !/^\d{4}$/.test(pin)) return;

    const s = selected;
    setBusy(s.id);
    setError(null);
    try {
      const response = await fetch(`/api/workspaces/${s.workspaceId}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ credential, studentId: s.id, pin }),
      });

      if (response.status === 409) {
        setError(
          "Этот лист уже открыт на другом устройстве. Попросите учителя сбросить вход.",
        );
        return;
      }
      if (response.status === 410) {
        setError("Урок уже закрыт. Попросите учителя выдать новый код.");
        return;
      }
      if (response.status === 429) {
        setError("Слишком много попыток. Подождите минуту и попробуйте снова.");
        return;
      }
      if (response.status === 403) {
        setError("Неверный личный PIN. Проверьте четыре цифры у учителя.");
        return;
      }
      if (!response.ok) {
        setError("Не удалось открыть лист. Проверьте код или позовите учителя.");
        return;
      }

      router.push(`/s/${s.workspaceId}`);
    } catch {
      setError("Нет связи с сервером. Проверьте интернет и попробуйте снова.");
    } finally {
      setBusy(null);
    }
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
            type="button"
            onClick={() => choose(s)}
            disabled={busy !== null}
            className={`text-left px-4 py-3 rounded-xl bg-paper border hover:border-accent hover:bg-chalk transition disabled:opacity-60 font-medium ${
              selectedId === s.id ? "border-accent ring-1 ring-accent" : "border-rule"
            }`}
          >
            {busy === s.id ? "Открываем…" : s.fullName}
          </button>
        ))}
      </div>
      {selected && (
        <form
          onSubmit={pick}
          className="mt-4 rounded-xl border border-accent/40 bg-paper p-4"
        >
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[180px] flex-1">
              <span className="block text-sm font-semibold">
                {selected.fullName}
              </span>
              <span className="mt-0.5 block text-xs text-dim">
                Введите личный PIN из четырёх цифр — его назовёт учитель.
              </span>
              <input
                key={selected.id}
                autoFocus
                value={pin}
                onChange={(event) => {
                  setPin(event.target.value.replace(/\D/g, "").slice(0, 4));
                  setError(null);
                }}
                inputMode="numeric"
                autoComplete="one-time-code"
                aria-label={`Личный PIN для ${selected.fullName}`}
                placeholder="••••"
                className="mt-3 w-40 rounded-lg border border-rule bg-chalk px-4 py-2.5 font-mono text-xl tracking-[0.35em]"
              />
            </label>
            <button
              type="submit"
              disabled={busy !== null || pin.length !== 4}
              className="rounded-lg bg-accent px-5 py-2.5 font-medium text-paper transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Открываем…" : "Открыть лист"}
            </button>
          </div>
        </form>
      )}
      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-red/30 bg-red/10 px-4 py-3 text-sm text-red"
        >
          {error}
        </p>
      )}
    </div>
  );
}
