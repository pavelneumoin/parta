"use client";

import { useActionState } from "react";
import { AuthShell } from "@/components/AuthShell";
import { signupAction, type SignupState } from "./actions";

const INITIAL: SignupState = { ok: false };

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(signupAction, INITIAL);

  return (
    <AuthShell
      title="Завести класс"
      subtitle="Бесплатно для одного класса. Email — для входа, никуда не делится."
      switchText="Уже есть аккаунт?"
      switchLabel="Войти"
      switchHref="/signin"
    >
      <form action={formAction} className="flex flex-col gap-4">
        <Field
          name="name"
          label="Как к вам обращаться"
          placeholder="Иван Иванович"
          error={state.fieldErrors?.name}
          autoComplete="name"
          required
        />
        <Field
          name="email"
          label="Email"
          type="email"
          placeholder="ivanov@school.ru"
          error={state.fieldErrors?.email}
          autoComplete="email"
          required
        />
        <Field
          name="password"
          label="Пароль"
          type="password"
          placeholder="Минимум 6 символов"
          error={state.fieldErrors?.password}
          autoComplete="new-password"
          required
        />
        {state.error && (
          <p className="text-red text-sm">{state.error}</p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="mt-2 px-4 py-3 rounded-xl bg-ink text-paper font-medium hover:bg-toolbarHover disabled:opacity-60 transition"
        >
          {pending ? "Создаём…" : "Завести класс"}
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
  error,
  autoComplete,
  required,
}: {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  error?: string;
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
        className={`px-3 py-2.5 rounded-lg border bg-paper outline-none focus:border-accent transition ${
          error ? "border-red" : "border-rule"
        }`}
      />
      {error && <span className="text-red text-xs">{error}</span>}
    </label>
  );
}
