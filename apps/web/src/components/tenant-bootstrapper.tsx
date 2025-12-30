"use client";

import { useEffect } from "react";
import { api } from "@/lib/api";
import { storage } from "@/lib/storage";

type TenantMeItem = {
  tenant: { id: string; name: string; createdAt?: string };
  role: string;
};

async function ensureTenantSelected() {
  const current = storage.getTenantId();

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
  if (chosenName) storage.setWorkspaceName(chosenName);
}

export function TenantBootstrapper() {
  useEffect(() => {
    (async () => {
      const token = storage.getToken();
      if (!token) return;

      // for tenant missing, fix it
      const tid = storage.getTenantId();
      if (!tid) {
        try {
          await ensureTenantSelected();
        } catch (e) {
          console.error("[tenant-bootstrap] failed:", e);
        }
      }
    })();
  }, []);

  return null;
}
