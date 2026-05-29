import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/**
 * Apple touch icon (180×180 PNG) генерируется из JSX через next/og.
 * Дублирует логику icon.svg: тёмная «тетрадь» + зелёная подпись снизу.
 */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          background: "#fbfaf6",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 36,
        }}
      >
        {/* тетрадь: тёмный прямоугольник */}
        <div
          style={{
            width: 110,
            height: 130,
            background: "#1a1f2b",
            borderRadius: 10,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            justifyContent: "flex-start",
            padding: "18px 16px 0",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* строки-текст */}
          <div style={{ width: 78, height: 8, background: "#f4f1e8", borderRadius: 4, marginBottom: 10 }} />
          <div style={{ width: 60, height: 8, background: "#f4f1e8", borderRadius: 4, marginBottom: 10 }} />
          <div style={{ width: 40, height: 8, background: "#f4f1e8", borderRadius: 4 }} />
          {/* зелёная полоса снизу */}
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: 12,
              background: "#1e6f5c",
              borderRadius: "0 0 10px 10px",
            }}
          />
        </div>
      </div>
    ),
    { ...size },
  );
}
