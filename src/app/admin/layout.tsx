"use client";

import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { Nav } from "@/components/ui/nav";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status !== "authenticated" || !session?.user) return;
    const { role, isApproved } = session.user;

    // ADMIN(강사)이면서 미승인 → pending 페이지로 (pending 페이지 자체는 제외)
    if (role === "ADMIN" && !isApproved && pathname !== "/admin/pending") {
      router.replace("/admin/pending");
    }
  }, [session, status, pathname, router]);

  // pending 페이지는 Nav 없이 렌더링
  if (pathname === "/admin/pending") {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav />
      <main className="mx-auto max-w-6xl px-3 py-4 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
