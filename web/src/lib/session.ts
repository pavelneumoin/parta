import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";

export async function requireTeacher() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const teacher = await db.teacher.findUnique({
    where: { id: session.user.id },
  });
  if (!teacher) redirect("/signin");
  return teacher;
}
