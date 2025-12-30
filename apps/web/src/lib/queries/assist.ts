import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type AssistCitation = {
  source: string;
  filename: string;
  chunkId: string;
};

export type AssistResponse = {
  ticketId: string;
  kbTopK: number;
  kbHits: number;
  commentSaved: boolean;
  commentSkipped: boolean;

  customer_reply: string;
  internal_notes: string;
  next_steps: string[];
  questions_for_customer: string[];
  citations: AssistCitation[];
};

export function useAssist(ticketId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { topK: number; tone: string; dryRun: boolean }) => {
      const r = await api.post<AssistResponse>(`/tickets/${ticketId}/assist`, payload);
      return r.data;
    },
    onSuccess: async () => {
      // refresh ticket detail + list
      await qc.invalidateQueries({ queryKey: ["tickets", ticketId] });
      await qc.invalidateQueries({ queryKey: ["tickets"] });
    },
  });
}
