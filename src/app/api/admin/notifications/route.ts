import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: 강사용 알림 카운트 (대기 중인 학부모 신청 수)
export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ pendingParents: 0 });
  }

  const pendingParents = await prisma.parentLink.count({
    where: { status: "PENDING" },
  });

  return NextResponse.json({ pendingParents });
}
