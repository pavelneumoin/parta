import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Парта · цифровая тетрадь для класса",
    short_name: "Парта",
    description:
      "Раздайте классу рабочий лист за 30 секунд. Видите, как пишет каждый ученик — прямо сейчас.",
    start_url: "/app",
    display: "standalone",
    background_color: "#fbfaf6",
    theme_color: "#1a1f2b",
    orientation: "any",
    categories: ["education", "productivity"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/apple-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
