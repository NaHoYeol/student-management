import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: Get my parent links
export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "PARENT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const links = await prisma.parentLink.findMany({
    where: { parentId: session.user.id },
    include: {
      student: { select: { id: true, name: true, school: true, grade: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(links);
}

// POST: Create a new parent link request (학부모가 자녀 정보를 직접 입력)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "PARENT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { studentName, schoolName, gradeName } = (await req.json()) as {
    studentName: string;
    schoolName: string;
    gradeName: string;
  };

  if (!studentName?.trim()) {
    return NextResponse.json({ error: "자녀 이름을 입력해주세요." }, { status: 400 });
  }

  const link = await prisma.parentLink.create({
    data: {
      parentId: session.user.id,
      studentName: studentName.trim(),
      schoolName: schoolName?.trim() || null,
      gradeName: gradeName?.trim() || null,
    },
  });

  return NextResponse.json(link, { status: 201 });
}
