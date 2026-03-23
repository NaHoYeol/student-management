import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin, isSuperAdmin } from "@/lib/role-check";

// GET: 알림 카운트 (학부모 신청 수 + SUPERADMIN이면 강사 대기 수)
export async function GET() {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ pendingParents: 0, pendingInstructors: 0 });
  }

  const pendingParents = await prisma.parentLink.count({
    where: { status: "PENDING" },
  });

  let pendingInstructors = 0;
  if (isSuperAdmin(session.user.role)) {
    pendingInstructors = await prisma.user.count({
      where: { role: "ADMIN", isApproved: false },
    });
  }

  return NextResponse.json({ pendingParents, pendingInstructors });
}
