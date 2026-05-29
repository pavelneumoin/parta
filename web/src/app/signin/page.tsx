"use client";

import { useActionState } from "react";
import { AuthShell } from "@/components/AuthShell";
import { signinAction, type SigninState } from "./actions";

const INITIAL: SigninState = { ok: false };

export default function SigninPage() {
  const [state, formAction, pending] = useActionState(signinAction, INITIAL);

  return (
    <AuthShell
      title="Войти"
      subtitle="С тем email, которым регистрировались."
      switchText="Ещё нет аккаунта?"
      switchLabel="Завести класс"
      switchHref="/signup"
    >
      <form action={formAction} className="flex flex-col gap-4">
        <Field
          name="email"
          label="Email"
          type="email"
          placeholder="ivanov@school.ru"
          autoComplete="email"
          required
        />
        <Field
          name="password"
          label="Пароль"
          type="password"
          placeholder="••••••"
          autoComplete="current-password"
          required
        />
        {state.error && <p className="text-red text-sm">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="mt-2 px-4 py-3 rounded-xl bg-ink text-paper font-medium hover:bg-toolbarHover disabled:opacity-60 transition"
        >
          {pending ? "Входим…" : "Войти"}
        </button>
      </form>
    </AuthShell>
  );
}

function Field({
  name,
  label,
  type = "text",
  placeholder,
  autoComplete,
  required,
}: {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm text-ink/80">{label}</span>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        className="px-3 py-2.5 rounded-lg border border-rule bg-paper outline-none focus:border-accent transition"
      />
    </label>
  );
}
