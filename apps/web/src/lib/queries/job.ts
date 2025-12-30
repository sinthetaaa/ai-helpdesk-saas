import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type Job = {
  id: string;
  tenantId: string;
  type: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  sourceId: string | null;
  attempts: number;
  lastError: string | null;
  payload: any;
  createdAt: string;
  updatedAt: string;
};

export function useJob(id?: string | null) {
  return useQuery({
    queryKey: ["jobs", id],
    queryFn: async () => {
      const r = await api.get<Job>(`/jobs/${id}`);
      return r.data;
    },
    enabled: !!id,
    staleTime: 1000,
    refetchInterval: 1500,
    refetchOnWindowFocus: false,
  });
}
