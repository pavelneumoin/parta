import Link from "next/link";
import { signOut } from "@/auth";
import { requireTeacher } from "@/lib/session";
import { AppNavLink } from "@/components/AppNavLink";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const teacher = await requireTeacher();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-rule bg-paper">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:flex-nowrap sm:gap-6 sm:px-6">
          <Link
            href="/app"
            className="flex shrink-0 items-center gap-2 font-semibold tracking-tight"
            title="К дашборду"
          >
            <svg width="24" height="24" viewBox="0 0 28 28" fill="none" aria-hidden>
              <rect x="3" y="6" width="22" height="16" rx="2" fill="#1a1f2b" />
              <rect x="6" y="9" width="16" height="2" rx="1" fill="#f4f1e8" />
              <rect x="6" y="13" width="12" height="2" rx="1" fill="#f4f1e8" />
              <rect x="6" y="17" width="8" height="2" rx="1" fill="#f4f1e8" />
              <rect x="3" y="22" width="22" height="2" rx="1" fill="#1e6f5c" />
            </svg>
            Парта
          </Link>
          <nav
            className="order-last flex w-full items-center gap-1 overflow-x-auto p-1 sm:order-none sm:w-auto sm:overflow-visible sm:p-0"
            aria-label="Главная навигация"
          >
            <AppNavLink href="/app" exact>Сегодня</AppNavLink>
            <AppNavLink href="/app/lessons">Уроки</AppNavLink>
            <AppNavLink href="/app/classes">Классы</AppNavLink>
            <AppNavLink href="/app/stats">Сводка</AppNavLink>
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span
              className="text-dim hidden sm:inline truncate max-w-[180px]"
              title={teacher.email}
            >
              {teacher.email}
            </span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button className="min-h-11 px-3 py-1.5 rounded-lg text-sm hover:bg-rule/50 transition sm:min-h-0">
                Выйти
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
