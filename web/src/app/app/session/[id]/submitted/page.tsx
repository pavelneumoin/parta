import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeacher } from "@/lib/session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SubmittedPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const teacher = await requireTeacher();

  const session = await db.session.findFirst({
    where: { id, teacherId: teacher.id },
    include: {
      lesson: { select: { title: true } },
      class: { select: { name: true } },
      workspaces: {
        where: { status: "submitted" },
        include: {
          student: { select: { fullName: true } },
          _count: { select: { strokes: true } },
          previews: {
            select: { pageIndex: true, updatedAt: true },
            orderBy: { pageIndex: "asc" },
          },
        },
        orderBy: { submittedAt: "desc" },
      },
    },
  });

  if (!session) notFound();

  const submitted = session.workspaces;

  return (
    <main className="max-w-7xl mx-auto px-6 py-8">
      <div className="mb-6">
        <Link
          href={`/app/session/${id}`}
          className="text-sm text-accent hover:underline"
        >
          ← к мозаике
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight mt-1">
          Сданные работы
        </h1>
        <p className="text-dim text-sm mt-1">
          {session.class.name} · {session.lesson.title} ·{" "}
          {submitted.length}{" "}
          {submitted.length === 1
            ? "работа сдана"
            : submitted.length >= 2 && submitted.length <= 4
              ? "работы сданы"
              : "работ сдано"}
        </p>
      </div>

      {submitted.length === 0 ? (
        <div className="rounded-xl border border-dashed border-rule p-16 text-center">
          <svg
            className="mx-auto mb-4 text-rule"
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M9 12l2 2 4-4" />
            <path d="M21 12c0 4.97-4.03 9-9 9S3 16.97 3 12 7.03 3 12 3s9 4.03 9 9z" />
          </svg>
          <p className="font-medium mb-1">Пока никто не сдал работу</p>
          <p className="text-dim text-sm">
            Когда ученик нажмёт «Сдать работу» — его превью появится здесь.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {submitted.map((ws) => {
            const hasPreview = ws.previews.length > 0;
            const submittedTime = ws.submittedAt
              ? fmtTime(ws.submittedAt)
              : "—";

            return (
              <Link
                key={ws.id}
                href={`/s/${ws.id}`}
                className="group block rounded-xl border border-rule hover:border-accent transition overflow-hidden bg-paper"
              >
                {/* превью изображение */}
                <div className="relative bg-chalk aspect-[5/7]">
                  {hasPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/workspaces/${ws.id}/preview?page=0&v=${ws.previews[0]!.updatedAt.getTime()}`}
                      alt={`Превью — ${ws.student.fullName}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-dim text-xs text-center p-4">
                      Превью ещё не загружено
                    </div>
                  )}

                  {/* бейдж «сдано» */}
                  <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full bg-green text-paper text-[10px] font-medium">
                    сдано
                  </div>
                </div>

                {/* мета-информация */}
                <div className="px-3 py-2.5">
                  <div className="font-medium text-sm truncate" title={ws.student.fullName}>
                    {ws.student.fullName}
                  </div>
                  <div className="text-xs text-dim mt-0.5 flex items-center justify-between">
                    <span>{submittedTime}</span>
                    <span className="font-mono">{ws._count.strokes} шт.</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {submitted.length > 0 && (
        <div className="mt-8 text-center">
          <p className="text-dim text-sm mb-3">
            Нажмите на превью, чтобы открыть работу в полном размере и оставить комментарий.
          </p>
          <Link
            href={`/app/session/${id}`}
            className="inline-block px-4 py-2 rounded-lg border border-rule hover:bg-chalk transition text-sm"
          >
            ← Вернуться к мозаике
          </Link>
        </div>
      )}
    </main>
  );
}

function fmtTime(d: Date) {
  return new Date(d).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
