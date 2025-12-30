import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export type KbSourceStatus = "QUEUED" | "INDEXING" | "READY" | "FAILED";

export type KbJob = {
  id: string;
  status: string;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type KbSource = {
  id: string;
  filename: string;
  mimeType?: string | null;
  sizeBytes: number;
  status: KbSourceStatus;
  error?: string | null;
  createdAt: string;
  indexedAt?: string | null;
  latestJob?: KbJob | null;
};

export type KbStatusCounts = Partial<Record<KbSourceStatus, number>> & {
  TOTAL?: number;
};

type KbSourcesListResponse = {
  items: KbSource[];
  total: number;
  page: number;
  pageSize: number;
};

function kbKeys() {
  return {
    sources: ["kb", "sources"] as const,
    statusCounts: ["kb", "status-counts"] as const,
  };
}

export function useKbSources() {
  return useQuery({
    queryKey: kbKeys().sources,
    queryFn: async () => {
      const r = await api.get<KbSourcesListResponse>("/kb/sources");
      return r.data.items; // return array, matches old behavior
    },
    staleTime: 2_000,
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
  });
}

export function useKbStatusCounts() {
  return useQuery({
    queryKey: kbKeys().statusCounts,
    queryFn: async () => {
      const r = await api.get<KbStatusCounts>("/kb/sources/status-counts");
      return r.data;
    },
    staleTime: 2_000,
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
  });
}

export function useUploadKbSource() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);

      // don't set Content-Type manually; axios adds boundary
      const r = await api.post("/kb/sources", form);
      return r.data as { sourceId: string; jobId?: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: kbKeys().sources });
      qc.invalidateQueries({ queryKey: kbKeys().statusCounts });
    },
  });
}

export function useRetryKbSource() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (sourceId: string) => {
      const r = await api.post(`/kb/sources/${sourceId}/retry`);
      return r.data as { jobId?: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: kbKeys().sources });
      qc.invalidateQueries({ queryKey: kbKeys().statusCounts });
    },
  });
}

export function useRepairKbSource() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (sourceId: string) => {
      const r = await api.post(`/kb/sources/${sourceId}/repair`);
      return r.data as { jobId?: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: kbKeys().sources });
      qc.invalidateQueries({ queryKey: kbKeys().statusCounts });
    },
  });
}