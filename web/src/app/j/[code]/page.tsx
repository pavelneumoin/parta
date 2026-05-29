import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { JoinPicker } from "./JoinPicker";

export const dynamic = "force-dynamic";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const session = await db.session.findUnique({
    where: { joinCode: code.toUpperCase() },
    include: {
      lesson: { select: { title: true } },
      class: {
        include: {
          students: {
            select: { id: true, fullName: true, anonToken: true },
            orderBy: { fullName: "asc" },
          },
        },
      },
      workspaces: { select: { studentId: true, id: true } },
    },
  });
  if (!session) notFound();
  if (session.closedAt) {
    return (
      <CenteredCard>
        <h1 className="text-xl font-semibold mb-2">Урок уже закрыт</h1>
        <p className="text-dim">Попросите учителя выдать новый код.</p>
      </CenteredCard>
    );
  }

  // строим карту student → workspace
  const workspaceByStudent = new Map(
    session.workspaces.map((w) => [w.studentId, w.id]),
  );

  return (
    <main className="min-h-screen flex flex-col">
      <header className="border-b border-rule bg-paper px-6 py-3 flex items-center gap-3">
        <svg width="22" height="22" viewBox="0 0 28 28" fill="none">
          <rect x="3" y="6" width="22" height="16" rx="2" fill="#1a1f2b" />
          <rect x="3" y="22" width="22" height="2" rx="1" fill="#4f7cff" />
        </svg>
        <span className="font-semibold">Парта</span>
        <div className="ml-auto text-sm text-dim">
          {session.class.name} · {session.lesson.title}
        </div>
      </header>
      <div className="flex-1 flex items-start justify-center px-4 py-8">
        <div className="max-w-2xl w-full">
          <h1 className="text-2xl font-semibold tracking-tight mb-2">
            Выберите своё имя
          </h1>
          <p className="text-dim mb-6">
            Нажмите на свою фамилию. Лист откроется только у вас.
          </p>
          <JoinPicker
            sessionCode={code}
            students={session.class.students.map((s) => ({
              id: s.id,
              fullName: s.fullName,
              anonToken: s.anonToken,
              workspaceId: workspaceByStudent.get(s.id) ?? "",
            }))}
          />
        </div>
      </div>
    </main>
  );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md w-full rounded-xl bg-paper border border-rule p-8 text-center">
        {children}
      </div>
    </main>
  );
}
