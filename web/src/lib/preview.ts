/**
 * Упрощённая подложка для PNG-превью (200×280).
 * Не идентична TemplateBackground (SVG) — рисует то же самое чёрной/серой графикой
 * непосредственно в Canvas2D.
 */
export function drawPreviewBackground(
  ctx: CanvasRenderingContext2D,
  kind: string,
  w: number,
  h: number,
) {
  ctx.save();
  ctx.strokeStyle = "#d8dee9";
  ctx.lineWidth = 0.5;

  if (kind === "blank_grid") {
    const stepX = (w * 24) / 1000;
    const stepY = (h * 24) / 700;
    ctx.beginPath();
    for (let x = stepX; x < w; x += stepX) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, h);
    }
    for (let y = stepY; y < h; y += stepY) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(w, y + 0.5);
    }
    ctx.stroke();
  } else if (kind === "blank_coord") {
    const stepX = (w * 24) / 1000;
    const stepY = (h * 24) / 700;
    ctx.beginPath();
    for (let x = stepX; x < w; x += stepX) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, h);
    }
    for (let y = stepY; y < h; y += stepY) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(w, y + 0.5);
    }
    ctx.stroke();
    // оси
    ctx.strokeStyle = "#6b7280";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w / 2 + 0.5, 0);
    ctx.lineTo(w / 2 + 0.5, h);
    ctx.moveTo(0, h / 2 + 0.5);
    ctx.lineTo(w, h / 2 + 0.5);
    ctx.stroke();
  } else if (kind === "blank_lined") {
    const step = (h * 32) / 700;
    ctx.beginPath();
    for (let y = step; y < h; y += step) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(w, y + 0.5);
    }
    ctx.stroke();
  }
  ctx.restore();
}
