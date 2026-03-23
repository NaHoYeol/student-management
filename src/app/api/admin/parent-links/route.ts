import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/role-check";

// GET: List all parent link requests
export async function GET() {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const links = await prisma.parentLink.findMany({
    include: {
      parent: { select: { id: true, name: true, email: true } },
      student: { select: { id: true, name: true, school: true, grade: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(links);
}
