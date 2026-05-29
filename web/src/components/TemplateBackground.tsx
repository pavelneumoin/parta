/**
 * Подложка под холст — рисуется одним SVG, разделяет логику с handwriting-прототипом.
 * Используется и на ученическом холсте, и в превью на мозаике учителя.
 */
export function TemplateBackground({
  kind,
  className,
}: {
  kind: string;
  className?: string;
}) {
  if (kind === "blank_grid") return <GridBg className={className} />;
  if (kind === "blank_coord") return <CoordBg className={className} />;
  if (kind === "blank_lined") return <LinedBg className={className} />;
  return <div className={className} />;
}

function GridBg({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="none"
    >
      <defs>
        <pattern id="grid24" width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#d8dee9" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid24)" />
    </svg>
  );
}

function CoordBg({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="none"
    >
      <defs>
        <pattern id="coord24" width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#d8dee9" strokeWidth="1" />
        </pattern>
        <pattern id="coordMajor" width="96" height="96" patternUnits="userSpaceOnUse">
          <path d="M 96 0 L 0 0 0 96" fill="none" stroke="#c0c8d4" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#coord24)" />
      <rect width="100%" height="100%" fill="url(#coordMajor)" />
      {/* Оси симулируем в центре */}
      <line x1="50%" y1="0" x2="50%" y2="100%" stroke="#6b7280" strokeWidth="1.5" />
      <line x1="0" y1="50%" x2="100%" y2="50%" stroke="#6b7280" strokeWidth="1.5" />
    </svg>
  );
}

function LinedBg({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="none"
    >
      <defs>
        <pattern id="lined32" width="100%" height="32" patternUnits="userSpaceOnUse">
          <line x1="0" y1="32" x2="100%" y2="32" stroke="#d8dee9" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#lined32)" />
    </svg>
  );
}
