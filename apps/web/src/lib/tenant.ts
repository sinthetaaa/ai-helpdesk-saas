import { api } from "@/lib/api";
import { storage } from "@/lib/storage";

type Membership = { tenant: { id: string; name: string } };

export async function ensureTenantSelected() {
  const token = storage.getToken();
  if (!token) return null;

  const existing = storage.getTenantId();
  if (existing) return existing;

  const { data } = await api.get<Membership[]>("/tenants/me");
  const t = data?.[0]?.tenant;
  if (!t) return null;

  storage.setTenantId(t.id);
  localStorage.setItem("wb_name", t.name);
  return t.id;
}
