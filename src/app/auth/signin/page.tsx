"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

type RoleOption = "ADMIN" | "STUDENT" | "PARENT";

const roles: { value: RoleOption; label: string; desc: string; color: string }[] = [
  { value: "ADMIN", label: "강사", desc: "과제 출제 및 학생 관리", color: "border-blue-500 bg-blue-50" },
  { value: "STUDENT", label: "학생", desc: "과제 풀기 및 성적 확인", color: "border-green-500 bg-green-50" },
  { value: "PARENT", label: "학부모", desc: "자녀 성적 확인 (읽기 전용)", color: "border-purple-500 bg-purple-50" },
];

export default function SignInPage() {
  const [selectedRole, setSelectedRole] = useState<RoleOption | null>(null);

  function handleSignIn(provider: string) {
    if (selectedRole) {
      document.cookie = `pending-role=${selectedRole};path=/;max-age=300`;
    }
    signIn(provider, { callbackUrl: "/" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg">
        <h1 className="mb-2 text-center text-2xl font-bold text-black">
          로그인
        </h1>
        <p className="mb-6 text-center text-sm text-black">
          역할을 선택한 후 소셜 계정으로 로그인하세요
        </p>

        {/* 역할 선택 */}
        <div className="mb-6 grid grid-cols-3 gap-2">
          {roles.map((r) => (
            <button
              key={r.value}
              onClick={() => setSelectedRole(r.value)}
              className={`rounded-lg border-2 p-3 text-center transition ${
                selectedRole === r.value
                  ? r.color + " ring-2 ring-offset-1"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <p className="text-sm font-semibold text-black">{r.label}</p>
              <p className="mt-0.5 text-[11px] text-gray-600">{r.desc}</p>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => handleSignIn("google")}
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-black transition hover:bg-gray-50"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Google로 로그인
          </button>

          <button
            onClick={() => handleSignIn("kakao")}
            className="flex w-full items-center justify-center gap-3 rounded-lg bg-[#FEE500] px-4 py-3 text-sm font-medium text-[#191919] transition hover:bg-[#FDD800]"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="#191919">
              <path d="M12 3C6.477 3 2 6.463 2 10.691c0 2.726 1.8 5.117 4.508 6.478-.146.53-.942 3.42-.972 3.632 0 0-.02.164.086.227.106.063.23.03.23.03.303-.042 3.513-2.313 4.066-2.71.68.097 1.38.148 2.082.148 5.523 0 10-3.463 10-7.805C22 6.463 17.523 3 12 3" />
            </svg>
            카카오로 로그인
          </button>
        </div>

        <p className="mt-6 text-center text-xs text-black">
          로그인 시 최소한의 프로필 정보(이름, 이메일)만 수집됩니다.
          <br />
          <span className="text-gray-500">첫 로그인 시 선택한 역할이 적용됩니다.</span>
        </p>
      </div>
    </div>
  );
}
