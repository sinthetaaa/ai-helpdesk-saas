import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type Tenant = { id: string; name: string };

export function useMyTenants() {
  return useQuery({
    queryKey: ["tenants", "me"],
    queryFn: async () => {
      const r = await api.get<Tenant[]>("/tenants/me");
      return r.data;
    },
  });
}

export function useCreateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const r = await api.post<Tenant>("/tenants", { name });
      return r.data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["tenants", "me"] });
    },
  });
}
