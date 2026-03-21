import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST: Set role for newly created users only (within 5 minutes of creation)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { role } = (await req.json()) as { role: string };
  if (!["ADMIN", "STUDENT", "PARENT"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { createdAt: true, role: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Only allow role change within 5 minutes of account creation
  const fiveMinutes = 5 * 60 * 1000;
  if (Date.now() - user.createdAt.getTime() > fiveMinutes) {
    return NextResponse.json({ error: "Role change not allowed" }, { status: 403 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { role: role as "ADMIN" | "STUDENT" | "PARENT" },
  });

  return NextResponse.json({ ok: true });
}
