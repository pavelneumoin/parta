"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AppNavLink({
  href,
  exact,
  children,
}: {
  href: string;
  exact?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      className={`inline-flex min-h-11 shrink-0 items-center whitespace-nowrap px-3 py-1.5 rounded-lg text-sm transition ${
        active
          ? "bg-ink text-paper"
          : "text-ink/80 hover:bg-rule/40"
      }`}
      aria-current={active ? "page" : undefined}
    >
      {children}
    </Link>
  );
}
