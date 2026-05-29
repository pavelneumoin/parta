import Link from "next/link";

export function AuthShell({
  title,
  subtitle,
  children,
  switchLabel,
  switchHref,
  switchText,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  switchLabel: string;
  switchHref: string;
  switchText: string;
}) {
  return (
    <main className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-toolbar text-paper">
        <Link href="/" className="flex items-center gap-2 hover:opacity-80">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <rect x="3" y="6" width="22" height="16" rx="2" fill="#f4f5f7" />
            <rect x="6" y="9" width="16" height="2" rx="1" fill="#1a1f2b" />
            <rect x="6" y="13" width="12" height="2" rx="1" fill="#1a1f2b" />
            <rect x="6" y="17" width="8" height="2" rx="1" fill="#1a1f2b" />
            <rect x="3" y="22" width="22" height="2" rx="1" fill="#4f7cff" />
          </svg>
          <span className="font-semibold tracking-tight">Парта</span>
        </Link>
        <div className="max-w-md">
          <p className="text-2xl lg:text-3xl font-medium leading-snug">
            «Видно каждого. Слышно никого.»
          </p>
          <p className="mt-3 text-paper/60">
            Цифровая тетрадь для класса — раздать урок за 30 секунд,
            видеть, как пишет каждый, подсказывать тихо.
          </p>
        </div>
        <p className="text-paper/40 text-sm">© Парта · {new Date().getFullYear()}</p>
      </div>

      <div className="flex flex-col justify-center p-6 sm:p-12 lg:p-16">
        <div className="max-w-md w-full mx-auto">
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-ink/70">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <p className="mt-6 text-sm text-dim">
            {switchText}{" "}
            <Link href={switchHref} className="text-accent hover:underline">
              {switchLabel}
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
