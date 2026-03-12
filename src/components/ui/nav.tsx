"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";

export function Nav() {
  const { data: session } = useSession();

  if (!session) return null;

  const isAdmin = session.user.role === "ADMIN";
  const basePath = isAdmin ? "/admin" : "/student";

  return (
    <nav className="border-b bg-white px-6 py-3">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href={`${basePath}/dashboard`} className="text-lg font-bold text-blue-600">
            학생 관리 시스템
          </Link>
          <Link
            href={`${basePath}/assignments`}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            {isAdmin ? "과제 관리" : "과제 목록"}
          </Link>
          {isAdmin && (
            <Link
              href="/admin/students"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              학생 관리
            </Link>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">
            {session.user.name}{" "}
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">
              {isAdmin ? "강사" : "학생"}
            </span>
          </span>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="text-sm text-red-500 hover:text-red-700"
          >
            로그아웃
          </button>
        </div>
      </div>
    </nav>
  );
}
