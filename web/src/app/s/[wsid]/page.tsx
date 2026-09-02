import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  studentAccessCookieName,
  verifyStudentAccessCookie,
} from "@/lib/studentAccess";
import { StudentCanvas } from "./StudentCanvas";

export const dynamic = "force-dynamic";

export default async function StudentWorkspacePage({
  params,
}: {
  params: Promise<{ wsid: string }>;
}) {
  const { wsid } = await params;
  const teacherSession = await auth();

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

  let viewerRole: "student" | "teacher";
  if (
    teacherSession?.user?.id &&
    teacherSession.user.id === ws.session.teacherId
  ) {
    viewerRole = "teacher";
  } else {
    const cookieStore = await cookies();
    const studentCookie = cookieStore.get(studentAccessCookieName(ws.id))?.value;
    if (!verifyStudentAccessCookie(studentCookie, ws)) {
      redirect("/");
    }
    viewerRole = "student";
  }

  return (
    <main className="h-[100dvh] flex flex-col bg-chalk">
      <StudentCanvas
        workspaceId={ws.id}
        studentName={ws.student.fullName}
        lessonTitle={ws.session.lesson.title}
        templateKind={ws.session.lesson.templateKind}
        pageCount={ws.session.lesson.pageCount}
        templateFileId={ws.session.lesson.templateId}
        sessionClosed={!!ws.session.closedAt}
        sessionId={ws.session.id}
        viewerRole={viewerRole}
        initialHandRaised={!!ws.handRaisedAt}
        initialSubmitted={ws.status === "submitted"}
      />
    </main>
  );
}
