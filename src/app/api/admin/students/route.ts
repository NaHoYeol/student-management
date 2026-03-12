import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const students = await prisma.user.findMany({
    where: { role: "STUDENT" },
    select: {
      id: true,
      name: true,
      email: true,
      submissions: {
        select: {
          id: true,
          score: true,
          totalPoints: true,
          assignment: { select: { title: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(students);
}
