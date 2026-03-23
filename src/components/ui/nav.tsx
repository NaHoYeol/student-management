"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import Link from "next/link";
import Image from "next/image";

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-8 w-8" />;

  const next = theme === "dark" ? "light" : theme === "light" ? "system" : "dark";
  const label = theme === "dark" ? "다크" : theme === "light" ? "라이트" : "시스템";

  return (
    <button
      onClick={() => setTheme(next)}
      className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-100"
      title={`현재: ${label} (클릭하여 변경)`}
    >
      {theme === "dark" ? (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      ) : theme === "light" ? (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ) : (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      )}
    </button>
  );
}

function NotificationBell() {
  const [count, setCount] = useState(0);

  const fetchCount = useCallback(() => {
    fetch("/api/admin/notifications")
      .then((r) => r.json())
      .then((data) => setCount(data.pendingParents || 0))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, [fetchCount]);

  return (
    <Link
      href="/admin/parents"
      className="relative flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-100"
      title="학부모 신청 알림"
    >
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}

export function Nav() {
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);

  if (!session) return null;

  const role = session.user.role;
  const isAdmin = role === "ADMIN";
  const isParent = role === "PARENT";

  const links = isAdmin
    ? [
        { href: "/admin/assignments", label: "과제 관리" },
        { href: "/admin/students", label: "학생 관리" },
        { href: "/admin/monthly", label: "월별 성취도" },
        { href: "/admin/parents", label: "학부모 관리" },
        { href: "/admin/class-options", label: "반 편성" },
        { href: "/admin/settings", label: "설정" },
      ]
    : isParent
    ? [
        { href: "/parent/dashboard", label: "대시보드" },
        { href: "/parent/setup", label: "자녀 관리" },
      ]
    : [
        { href: "/student/assignments", label: "과제 목록" },
        { href: "/student/monthly", label: "월별 성취도" },
        { href: "/student/profile", label: "내 정보" },
      ];

  const homeHref = isAdmin
    ? "/admin/dashboard"
    : isParent
    ? "/parent/dashboard"
    : "/student/assignments";

  const roleBadge = isAdmin ? "강사" : isParent ? "학부모" : "학생";

  return (
    <nav className="border-b bg-white px-4 py-3 sm:px-6">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        {/* 로고 */}
        <Link href={homeHref} className="flex items-center gap-2">
          <Image src="/aim-logo.png" alt="A.I.M" width={80} height={36} className="h-8 w-auto rounded" />
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
        <div className="hidden items-center gap-2 sm:flex">
          <ThemeToggle />
          {isAdmin && <NotificationBell />}
          <span className="text-sm text-black">
            {session.user.name}{" "}
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">
              {roleBadge}
            </span>
          </span>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="text-sm text-red-500 hover:text-red-700"
          >
            로그아웃
          </button>
        </div>

        {/* 모바일: 알림 + 테마 토글 + 햄버거 */}
        <div className="flex items-center gap-1 sm:hidden">
          {isAdmin && <NotificationBell />}
          <ThemeToggle />
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-gray-100"
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
                  {roleBadge}
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
