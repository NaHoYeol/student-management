"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session?.user) {
      const path =
        session.user.role === "ADMIN"
          ? "/admin/dashboard"
          : "/student/dashboard";
      router.replace(path);
    }
  }, [session, router]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-900">로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-gray-50">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900">
          학생 과제 관리 시스템
        </h1>
        <p className="mt-3 text-lg text-gray-900">
          과제 제출, 자동 채점, 진척도 관리를 한 곳에서
        </p>
      </div>
      <Link
        href="/auth/signin"
        className="rounded-lg bg-blue-600 px-8 py-3 text-lg font-medium text-white transition hover:bg-blue-700"
      >
        로그인하기
      </Link>
    </div>
  );
}
