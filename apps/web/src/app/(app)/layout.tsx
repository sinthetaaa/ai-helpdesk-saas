import { AuthGate } from "@/components/auth-gate";
import { AppShell } from "@/components/app-shell";
import { CommandPalette } from "@/components/command-palette";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <AppShell>
        {children}
        <CommandPalette />
      </AppShell>
    </AuthGate>
  );
}
