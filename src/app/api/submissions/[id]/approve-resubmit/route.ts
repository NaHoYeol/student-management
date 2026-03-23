import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/role-check";

// PUT: Approve resubmission for a student (Admin only)
export async function PUT(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const submission = await prisma.submission.findUnique({
    where: { id },
  });

  if (!submission) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (submission.isAgent) {
    return NextResponse.json({ error: "Agent 제출은 수정할 수 없습니다." }, { status: 400 });
  }

  const updated = await prisma.submission.update({
    where: { id },
    data: { resubmitApproved: true },
  });

  return NextResponse.json(updated);
}
