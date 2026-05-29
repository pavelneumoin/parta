import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeacher } from "@/lib/session";
import { db } from "@/lib/db";
import { qrDataUrl } from "@/lib/qr";
import { baseUrl } from "@/lib/baseUrl";
import { SessionMosaic } from "./SessionMosaic";
import { CloseSessionButton } from "./CloseSessionButton";
import { ExportClassButton } from "./ExportClassButton";

export const dynamic = "force-dynamic";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const teacher = await requireTeacher();

  const session = await db.session.findFirst({
    where: { id, teacherId: teacher.id },
    include: {
      lesson: true,
      class: true,
      workspaces: {
        include: { student: true, _count: { select: { strokes: true } } },
        orderBy: { student: { fullName: "asc" } },
      },
    },
  });
  if (!session) notFound();

  const url = `${await baseUrl()}/j/${session.joinCode}`;
  const qr = await qrDataUrl(url);

  return (
    <main className="max-w-7xl mx-auto px-6 py-6">
      <header className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <Link
            href={`/app/lessons/${session.lessonId}`}
            className="text-sm text-accent hover:underline"
          >
            ← {session.lesson.title}
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">
            {session.class.name} · {session.lesson.title}
          </h1>
          <p className="text-dim text-sm mt-1">
            {session.closedAt ? "Урок закрыт" : "Идёт сейчас"} ·{" "}
            {session.workspaces.length} рабочих листов
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {!session.closedAt && (
            <div className="px-4 py-2.5 rounded-xl bg-toolbar text-paper font-mono text-2xl tracking-widest">
              {session.joinCode}
            </div>
          )}
          <ExportClassButton
            sessionId={session.id}
            className={session.class.name}
            lessonTitle={session.lesson.title}
          />
          {!session.closedAt && <CloseSessionButton sessionId={session.id} />}
        </div>
      </header>

      {!session.closedAt && (
        <section className="mb-6 rounded-xl bg-toolbar text-paper p-5 flex flex-wrap items-center gap-6">
          <img
            src={qr}
            alt="QR-код входа в урок"
            width={160}
            height={160}
            className="rounded-lg bg-paper p-2"
          />
          <div className="flex-1 min-w-[280px]">
            <p className="text-xs uppercase tracking-wide text-paper/60 mb-1">
              Ученики входят так
            </p>
            <p className="font-mono text-base sm:text-lg break-all text-paper/90">
              {url}
            </p>
            <p className="text-paper/60 text-sm mt-2">
              Или диктуйте код{" "}
              <span className="font-mono text-paper">{session.joinCode}</span> на
              экране входа.
            </p>
          </div>
        </section>
      )}

      <SessionMosaic sessionId={session.id} />
    </main>
  );
}
