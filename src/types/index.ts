import type { Role } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      isApproved: boolean;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
