import type { Metadata, Viewport } from "next";
import "./globals.css";

const TITLE = "Парта · цифровая тетрадь для класса";
const DESCRIPTION =
  "Раздайте классу рабочий лист за 30 секунд. Видите, как пишет каждый ученик — прямо сейчас. Подсказывайте красным, не вызывая к доске.";

export const metadata: Metadata = {
  title: {
    default: TITLE,
    template: "%s · Парта",
  },
  description: DESCRIPTION,
  keywords: ["цифровая тетрадь", "рабочий лист", "класс", "учитель", "ученик", "урок"],
  authors: [{ name: "Парта" }],

  // Open Graph
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: "Парта",
    title: TITLE,
    description: DESCRIPTION,
  },

  // Twitter Card
  twitter: {
    card: "summary",
    title: TITLE,
    description: DESCRIPTION,
  },

  // PWA — manifest.ts автоматически подхватывается Next.js
  manifest: "/manifest.webmanifest",

  // Apple
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Парта",
  },

  // Robots
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1a1f2b" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1f2b" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
