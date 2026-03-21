import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: List students for a given instructor
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "PARENT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const instructorId = url.searchParams.get("instructorId");
  if (!instructorId) {
    return NextResponse.json({ error: "instructorId required" }, { status: 400 });
  }

  const students = await prisma.user.findMany({
    where: { role: "STUDENT", instructorId },
    select: { id: true, name: true, school: true, grade: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(students);
}
