import { Nav } from "@/components/ui/nav";

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Nav />
      <main className="mx-auto max-w-4xl px-6 py-8">{children}</main>
    </div>
  );
}
