import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type FeedbackRating = "UP" | "DOWN";

export function useAiFeedback() {
  return useMutation({
    mutationFn: async (payload: { ticketId: string; rating: FeedbackRating; comment?: string }) => {
      const r = await api.post("/ai/feedback", payload);
      return r.data;
    },
  });
}
