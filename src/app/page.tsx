"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function deleteCookie(name: string) {
  document.cookie = `${name}=;path=/;max-age=0`;
}

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const roleSetRef = useRef(false);

  useEffect(() => {
    if (!session?.user || roleSetRef.current) return;

    const pendingRole = getCookie("pending-role");

    async function applyRole() {
      if (pendingRole && ["ADMIN", "STUDENT", "PARENT", "SUPERADMIN"].includes(pendingRole)) {
        // Try to set role for new users
        try {
          await fetch("/api/auth/set-role", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role: pendingRole }),
          });
        } catch {
          // ignore - existing user or expired
        }
        deleteCookie("pending-role");
      }

      // Redirect based on role (re-fetch to get updated role)
      const res = await fetch("/api/auth/session");
      const sess = await res.json();
      const role = sess?.user?.role || session?.user?.role;

      if (role === "SUPERADMIN") {
        router.replace("/superadmin/instructors");
      } else if (role === "ADMIN") {
        router.replace("/admin/dashboard");
      } else if (role === "PARENT") {
        router.replace("/parent/dashboard");
      } else {
        router.replace("/student/assignments");
      }
    }

    roleSetRef.current = true;
    applyRole();
  }, [session, router]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-black">로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-gray-50">
      <div className="flex flex-col items-center text-center">
        <Image src="/aim-logo.png" alt="A.I.M" width={280} height={126} className="rounded-xl" priority />
        <p className="mt-4 text-lg text-black">
          학업 성취도 향상 관리
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
