import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { StudentCanvas } from "./StudentCanvas";

export const dynamic = "force-dynamic";

export default async function StudentWorkspacePage({
  params,
}: {
  params: Promise<{ wsid: string }>;
}) {
  const { wsid } = await params;

  const ws = await db.workspace.findUnique({
    where: { id: wsid },
    include: {
      student: { select: { fullName: true } },
      session: {
        include: {
          lesson: {
            select: {
              title: true,
              templateKind: true,
              pageCount: true,
              templateId: true,
            },
          },
        },
      },
    },
  });
  if (!ws) notFound();

  return (
    <main className="h-screen flex flex-col bg-chalk">
      <StudentCanvas
        workspaceId={ws.id}
        studentName={ws.student.fullName}
        lessonTitle={ws.session.lesson.title}
        templateKind={ws.session.lesson.templateKind}
        pageCount={ws.session.lesson.pageCount}
        templateFileId={ws.session.lesson.templateId}
        sessionClosed={!!ws.session.closedAt}
        sessionId={ws.session.id}
        joinCode={ws.session.joinCode}
        initialHandRaised={!!ws.handRaisedAt}
        initialSubmitted={ws.status === "submitted"}
      />
    </main>
  );
}
