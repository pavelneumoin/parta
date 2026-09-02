"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function JoinCodeForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = code.replace(/\s+/g, "").toUpperCase();
    if (!/^[2-9]{6}$/.test(normalized)) {
      setError("Введите 6 цифр из кода учителя");
      return;
    }

    setError("");
    router.push(`/j/${encodeURIComponent(normalized)}`);
  }

  return (
    <form
      onSubmit={submit}
      className="mt-8 max-w-md rounded-2xl border border-rule bg-paper p-4 shadow-sm"
    >
      <label htmlFor="lesson-code" className="block text-sm font-semibold">
        Уже на уроке?
      </label>
      <p className="mt-1 text-sm text-dim">
        Введите код с доски — регистрация не нужна.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          id="lesson-code"
          name="lesson-code"
          value={code}
          onChange={(event) => {
            setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
            setError("");
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="••••••"
          aria-describedby={error ? "lesson-code-error" : undefined}
          className="min-w-0 flex-1 rounded-xl border border-rule bg-chalk px-4 py-3 font-mono text-lg tracking-[0.3em] placeholder:tracking-[0.3em]"
        />
        <button
          type="submit"
          className="rounded-xl bg-accent px-5 py-3 font-medium text-paper transition hover:opacity-90"
        >
          Войти
        </button>
      </div>
      {error && (
        <p id="lesson-code-error" role="alert" className="mt-2 text-sm text-red">
          {error}
        </p>
      )}
    </form>
  );
}
