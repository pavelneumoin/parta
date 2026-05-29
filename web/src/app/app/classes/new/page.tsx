"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  createClassAction,
  type CreateClassState,
} from "../actions";

const INITIAL: CreateClassState = { ok: false };

export default function NewClassPage() {
  const [state, formAction, pending] = useActionState(createClassAction, INITIAL);

  return (
    <main className="max-w-2xl mx-auto px-6 py-8">
      <div className="mb-6">
        <Link href="/app/classes" className="text-sm text-accent hover:underline">
          ← к классам
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight mt-1">
          Завести класс
        </h1>
        <p className="text-dim mt-1">
          Имена учеников — каждое с новой строки. Их можно поправить или добавить
          новых позже.
        </p>
      </div>

      <form action={formAction} className="flex flex-col gap-5">
        <Field
          name="name"
          label="Название класса"
          placeholder="7А"
          error={state.fieldErrors?.name}
          required
        />
        <Field
          name="grade"
          label="Параллель (необязательно)"
          placeholder="7"
          type="number"
          error={state.fieldErrors?.grade}
        />

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-ink/80">Ученики (по одному на строку)</span>
          <textarea
            name="students"
            rows={14}
            required
            placeholder={`Иванов Иван\nПетрова Анна\nСидоров Сергей`}
            className={`px-3 py-2.5 rounded-lg border bg-paper outline-none focus:border-accent transition font-mono text-sm leading-relaxed ${
              state.fieldErrors?.studentsRaw ? "border-red" : "border-rule"
            }`}
          />
          {state.fieldErrors?.studentsRaw && (
            <span className="text-red text-xs">{state.fieldErrors.studentsRaw}</span>
          )}
        </label>

        <div className="flex justify-end gap-3 mt-2">
          <Link
            href="/app/classes"
            className="px-4 py-2.5 rounded-xl border border-rule hover:bg-rule/40 transition"
          >
            Отмена
          </Link>
          <button
            type="submit"
            disabled={pending}
            className="px-5 py-2.5 rounded-xl bg-ink text-paper font-medium hover:bg-toolbarHover disabled:opacity-60 transition"
          >
            {pending ? "Создаём…" : "Создать класс"}
          </button>
        </div>
      </form>
    </main>
  );
}

function Field({
  name,
  label,
  type = "text",
  placeholder,
  error,
  required,
}: {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  error?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm text-ink/80">{label}</span>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        className={`px-3 py-2.5 rounded-lg border bg-paper outline-none focus:border-accent transition ${
          error ? "border-red" : "border-rule"
        }`}
      />
      {error && <span className="text-red text-xs">{error}</span>}
    </label>
  );
}
