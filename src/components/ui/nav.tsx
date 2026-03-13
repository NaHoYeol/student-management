"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";

export function Nav() {
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);

  if (!session) return null;

  const isAdmin = session.user.role === "ADMIN";
  const basePath = isAdmin ? "/admin" : "/student";

  const links = isAdmin
    ? [
        { href: `${basePath}/assignments`, label: "과제 관리" },
        { href: "/admin/students", label: "학생 관리" },
        { href: "/admin/class-options", label: "반 편성" },
        { href: "/admin/settings", label: "설정" },
      ]
    : [
        { href: `${basePath}/assignments`, label: "과제 목록" },
        { href: "/student/profile", label: "내 정보" },
      ];

  return (
    <nav className="border-b bg-white px-4 py-3 sm:px-6">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        {/* 로고 */}
        <Link href={`${basePath}/dashboard`} className="text-base font-bold text-blue-600 sm:text-lg">
          학생 관리
        </Link>

        {/* 데스크탑 메뉴 */}
        <div className="hidden items-center gap-5 sm:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-black hover:text-blue-600"
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* 데스크탑 유저 정보 */}
        <div className="hidden items-center gap-3 sm:flex">
          <span className="text-sm text-black">
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

        {/* 모바일 햄버거 */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-gray-100 sm:hidden"
          aria-label="메뉴"
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {menuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* 모바일 드롭다운 메뉴 */}
      {menuOpen && (
        <div className="mt-3 border-t pt-3 sm:hidden">
          <div className="flex flex-col gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm text-black hover:bg-gray-100 active:bg-gray-200"
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-2 border-t pt-2">
              <div className="px-3 py-2 text-sm text-black">
                {session.user.name}{" "}
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">
                  {isAdmin ? "강사" : "학생"}
                </span>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="w-full rounded-lg px-3 py-2.5 text-left text-sm text-red-500 hover:bg-red-50 active:bg-red-100"
              >
                로그아웃
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
