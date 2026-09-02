import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeacher } from "@/lib/session";
import { db } from "@/lib/db";
import { qrDataUrl } from "@/lib/qr";
import { baseUrl } from "@/lib/baseUrl";
import { deriveWorkspaceJoinPins } from "@/lib/studentAccess";
import { SessionMosaic } from "./SessionMosaic";
import { CloseSessionButton } from "./CloseSessionButton";
import { ExportClassButton } from "./ExportClassButton";
import { FreezeButton } from "./FreezeButton";

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

  const url = `${await baseUrl()}/j/${session.qrToken}`;
  const qr = await qrDataUrl(url);
  const workspacePins = deriveWorkspaceJoinPins(
    session.workspaces.map((workspace) => workspace.id),
  );

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
          {session.workspaces.filter((w) => w.status === "submitted").length > 0 && (
            <Link
              href={`/app/session/${session.id}/submitted`}
              className="px-4 py-2.5 rounded-xl border border-rule hover:bg-chalk transition text-sm font-medium"
            >
              Сданные работы ({session.workspaces.filter((w) => w.status === "submitted").length})
            </Link>
          )}
          <ExportClassButton
            sessionId={session.id}
            className={session.class.name}
            lessonTitle={session.lesson.title}
          />
          {!session.closedAt && <FreezeButton sessionId={session.id} />}
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
              экране входа. После выбора фамилии ученик вводит свой личный PIN.
            </p>
          </div>
        </section>
      )}

      {!session.closedAt && (
        <details className="mb-6 rounded-xl border border-rule bg-paper">
          <summary className="cursor-pointer px-5 py-4 font-medium">
            Личные PIN-коды учеников
            <span className="ml-2 text-sm font-normal text-dim">
              показать для раздачи
            </span>
          </summary>
          <div className="border-t border-rule px-5 py-4">
            <p className="mb-4 text-sm text-dim">
              Назовите каждому ребёнку только его четыре цифры. PIN действует
              лишь для этой работы и не отображается на публичной странице.
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {session.workspaces.map((workspace) => (
                <div
                  key={workspace.id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-chalk px-3 py-2"
                >
                  <span className="min-w-0 truncate text-sm">
                    {workspace.student.fullName}
                  </span>
                  <span className="font-mono text-base font-semibold tracking-widest">
                    {workspacePins.get(workspace.id)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </details>
      )}

      <SessionMosaic sessionId={session.id} />
    </main>
  );
}
