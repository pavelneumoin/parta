import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const isAuth = !!req.auth;
  const url = req.nextUrl;

  // защищаем /app/*
  if (url.pathname.startsWith("/app") && !isAuth) {
    const signinUrl = new URL("/signin", req.url);
    signinUrl.searchParams.set("from", url.pathname);
    return NextResponse.redirect(signinUrl);
  }

  // Авторизованному учителю не нужен повторный лендинг/вход.
  if (
    (url.pathname === "/" ||
      url.pathname === "/signin" ||
      url.pathname === "/signup") &&
    isAuth
  ) {
    return NextResponse.redirect(new URL("/app", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|prototype|.*\\.(?:png|jpg|jpeg|svg|webp|gif|ico)$).*)",
  ],
};
