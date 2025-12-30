"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { api } from "@/lib/api";
import { storage } from "@/lib/storage";

type TenantMeItem = {
  tenant: { id: string; name: string; createdAt?: string };
  role: string;
};

function normalizeTenantId(v: string | null) {
  if (!v) return null;
  if (v === "undefined" || v === "null") return null;
  return v;
}

async function ensureTenantSelected() {
  const current = normalizeTenantId(storage.getTenantId());

  const r = await api.get<TenantMeItem[]>("/tenants/me");
  const memberships = r.data ?? [];

  let chosen =
    (current && memberships.find((m) => m.tenant?.id === current)?.tenant?.id) ||
    memberships[0]?.tenant?.id;

  let chosenName =
    (current && memberships.find((m) => m.tenant?.id === current)?.tenant?.name) ||
    memberships[0]?.tenant?.name;

  if (!chosen) {
    await api.post("/tenants", { name: "Demo Tenant" });
    const r2 = await api.get<TenantMeItem[]>("/tenants/me");
    const m2 = r2.data ?? [];
    chosen = m2[0]?.tenant?.id;
    chosenName = m2[0]?.tenant?.name;
  }

  if (!chosen) throw new Error("Could not select or create a tenant.");

  storage.setTenantId(chosen);
  if (chosenName) (storage as any).setWorkspaceName?.(chosenName);

  return chosen;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: false },
          mutations: { retry: 0 },
        },
      })
  );

  const [tenantReady, setTenantReady] = React.useState(() => {
    const token = storage.getToken();
    if (!token) return true;
    return !!normalizeTenantId(storage.getTenantId());
  });

  React.useEffect(() => {
    (async () => {
      const token = storage.getToken();
      if (!token) {
        setTenantReady(true);
        return;
      }

      const tid = normalizeTenantId(storage.getTenantId());
      if (tid) {
        setTenantReady(true);
        return;
      }

      try {
        await ensureTenantSelected();
      } catch (e) {
        console.error("[providers] tenant bootstrap failed:", e);
      } finally {
        setTenantReady(true);
        // once tenant is set, refetch anything that may have failed before
        queryClient.invalidateQueries();
      }
    })();
  }, [queryClient]);

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <QueryClientProvider client={queryClient}>
        {!tenantReady ? (
          <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
            Loading workspace…
          </div>
        ) : (
          children
        )}
        <Toaster richColors closeButton />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
