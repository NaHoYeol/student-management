export function isAdmin(role: string): boolean {
  return role === "ADMIN" || role === "SUPERADMIN";
}

export function isSuperAdmin(role: string): boolean {
  return role === "SUPERADMIN";
}
