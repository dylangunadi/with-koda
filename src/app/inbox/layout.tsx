import { AppShell } from "@/components/AppShell";

export default function InboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
