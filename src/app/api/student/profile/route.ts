import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      school: true,
      grade: true,
      classDay: true,
      classTime: true,
    },
  });

  const options: Record<string, string[]> = {
    school: [],
    grade: [],
    classDay: [],
    classTime: [],
  };

  try {
    const optionsRaw = await prisma.classOption.findMany({
      orderBy: [{ type: "asc" }, { value: "asc" }],
    });
    for (const o of optionsRaw) {
      if (options[o.type]) options[o.type].push(o.value);
    }
  } catch {
    // Table may not exist yet
  }

  return NextResponse.json({ profile: user, options });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, school, grade, classDay, classTime } = body as {
    name?: string;
    school?: string;
    grade?: string;
    classDay?: string;
    classTime?: string;
  };

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      ...(name !== undefined && { name }),
      ...(school !== undefined && { school }),
      ...(grade !== undefined && { grade }),
      ...(classDay !== undefined && { classDay }),
      ...(classTime !== undefined && { classTime }),
    },
    select: {
      id: true,
      name: true,
      email: true,
      school: true,
      grade: true,
      classDay: true,
      classTime: true,
    },
  });

  return NextResponse.json(user);
}
