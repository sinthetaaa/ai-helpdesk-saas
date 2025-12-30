import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type Ticket = {
  id: string;
  title: string;
  description?: string | null;
  status?: string | null;
  priority?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type TicketComment = {
  id: string;
  body?: string | null;
  content?: string | null; // some backends use content instead of body
  authorId?: string | null;
  createdAt?: string;
  isAi?: boolean;
};

function pickCommentText(c: TicketComment) {
  return c.body ?? c.content ?? "";
}

export function useTickets() {
  return useQuery({
    queryKey: ["tickets"],
    queryFn: async () => {
      const r = await api.get<Ticket[]>("/tickets");
      return r.data ?? [];
    },
  });
}

export function useTicket(id: string | null) {
  return useQuery({
    queryKey: ["tickets", id],
    enabled: !!id,
    queryFn: async () => {
      const r = await api.get<any>(`/tickets/${id}`);
      // backend might return {ticket, comments} or ticket with comments embedded
      return r.data;
    },
  });
}

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { title: string; description?: string }) => {
      const r = await api.post<Ticket>("/tickets", payload);
      return r.data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["tickets"] });
    },
  });
}

export function useAddComment(ticketId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { body: string }) => {
      const r = await api.post(`/tickets/${ticketId}/comments`, payload);
      return r.data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["tickets", ticketId] });
      await qc.invalidateQueries({ queryKey: ["tickets"] });
    },
  });
}

export function useUpdateTicket(ticketId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, any>) => {
      const r = await api.patch(`/tickets/${ticketId}`, payload);
      return r.data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["tickets", ticketId] });
      await qc.invalidateQueries({ queryKey: ["tickets"] });
    },
  });
}

export { pickCommentText };
