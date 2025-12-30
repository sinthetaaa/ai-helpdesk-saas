"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, RefreshCcw } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  pickCommentText,
  useAddComment,
  useCreateTicket,
  useTicket,
  useTickets,
  useUpdateTicket,
} from "@/lib/queries/tickets";

import { AssistDrawer } from "@/components/assist-drawer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function isTypingTarget(target: unknown) {
  // e.target can be Text (no getAttribute), so guard hard.
  if (!(target instanceof Element)) return false;

  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;

  // contenteditable can be on the element or inherited from a parent
  if (target.getAttribute("contenteditable") === "true") return true;
  return !!target.closest?.('[contenteditable="true"]');
}

export default function TicketsPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const { data: tickets = [], isLoading, refetch, isFetching } = useTickets();

  const selectedId = sp.get("id");
  const selectedTicket = tickets.find((t) => t.id === selectedId) ?? null;

  // Auto-select first ticket on desktop when none selected
  React.useEffect(() => {
    if (!selectedId && tickets.length > 0) {
      router.replace(`/tickets?id=${tickets[0].id}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets.length]);

  // Keyboard nav: j/k to move selection (Linear-ish)
  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;

      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        if (!tickets.length) return;

        const idx = Math.max(
          0,
          tickets.findIndex((t) => t.id === selectedId),
        );

        const next =
          e.key === "j"
            ? tickets[Math.min(tickets.length - 1, idx + 1)]
            : tickets[Math.max(0, idx - 1)];

        if (next?.id) router.push(`/tickets?id=${next.id}`);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [tickets, selectedId, router]);

  return (
    <div className="space-y-4">
      <Header
        onCreate={(id) => router.push(`/tickets?id=${id}`)}
        onRefresh={() => refetch()}
        refreshing={isFetching}
      />

      <div className="grid gap-4 md:grid-cols-[380px_1fr]">
        {/* Left list */}
        <Card className="overflow-hidden">
          <div className="border-b p-3 text-sm text-muted-foreground flex items-center justify-between">
            <span>{isLoading ? "Loading…" : `${tickets.length} tickets`}</span>
            <span className="text-xs">j/k to navigate</span>
          </div>

          <ScrollArea className="h-[calc(100vh-230px)]">
            <div className="p-2 space-y-1">
              {isLoading ? (
                <>
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </>
              ) : tickets.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">
                  No tickets yet. Create your first one.
                </div>
              ) : (
                tickets.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => router.push(`/tickets?id=${t.id}`)}
                    className={cn(
                      "w-full rounded-md border p-3 text-left transition hover:bg-secondary/40",
                      selectedId === t.id ? "bg-secondary border-secondary" : "bg-background",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{t.title}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {t.description ?? "—"}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant="secondary" className="text-[10px]">
                          {t.status ?? "OPEN"}
                        </Badge>
                        {t.priority ? (
                          <Badge variant="outline" className="text-[10px]">
                            {t.priority}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </Card>

        {/* Right detail */}
        <Card className="overflow-hidden">
          {!selectedId ? (
            <div className="p-6 text-sm text-muted-foreground">Select a ticket.</div>
          ) : (
            <TicketDetail ticketId={selectedId} title={selectedTicket?.title ?? ""} />
          )}
        </Card>
      </div>
    </div>
  );
}

function Header({
  onCreate,
  onRefresh,
  refreshing,
}: {
  onCreate: (id: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const createTicket = useCreateTicket();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [desc, setDesc] = React.useState("");

  async function submit() {
    const t = title.trim();
    if (!t) return toast.error("Title is required");
    try {
      const created = await createTicket.mutateAsync({
        title: t,
        description: desc.trim() || undefined,
      });
      toast.success("Ticket created");
      setOpen(false);
      setTitle("");
      setDesc("");
      onCreate(created.id);
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Create failed");
    }
  }

  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-2xl font-semibold">Tickets</div>
        <div className="text-sm text-muted-foreground">
          Split view, fast navigation, real-feel workflow
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={onRefresh} disabled={refreshing} className="gap-2">
          <RefreshCcw className="h-4 w-4" />
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>

        <Button
          variant="outline"
          className="gap-2"
          onClick={() =>
            window.dispatchEvent(
              new KeyboardEvent("keydown", {
                key: "k",
                metaKey: true, // mac
                ctrlKey: true, // windows (harmless on mac)
              }),
            )
          }
        >
          Search
        </Button>

        <Button onClick={() => setOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          New ticket
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create ticket</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
            <Textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Description"
            />
            <Button onClick={submit} disabled={createTicket.isPending}>
              {createTicket.isPending ? "Creating…" : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TicketDetail({ ticketId }: { ticketId: string; title: string }) {
  const { data, isLoading } = useTicket(ticketId);

  // normalize possible shapes:
  const ticket = (data?.ticket ?? data) as any;
  const comments = (data?.comments ?? ticket?.comments ?? []) as any[];

  const update = useUpdateTicket(ticketId);
  const addComment = useAddComment(ticketId);

  const [comment, setComment] = React.useState("");

  async function submitComment() {
    const body = comment.trim();
    if (!body) return;
    try {
      await addComment.mutateAsync({ body });
      setComment("");
      toast.success("Comment added");
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Comment failed");
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-3">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-230px)] flex-col">
      {/* header */}
      <div className="border-b p-4 space-y-2">
        <div className="text-lg font-semibold">{ticket?.title ?? "Ticket"}</div>
        <div className="text-sm text-muted-foreground">{ticket?.description ?? "—"}</div>

        <div className="flex flex-wrap items-center gap-2 pt-2">
          <Badge variant="secondary">{ticket?.status ?? "OPEN"}</Badge>
          {ticket?.priority ? <Badge variant="outline">{ticket.priority}</Badge> : null}

          <div className="ml-auto flex items-center gap-2">
            <AssistDrawer ticketId={ticketId} />

            <Select
              value={ticket?.status ?? "OPEN"}
              onValueChange={(v) => update.mutate({ status: v })}
            >
              <SelectTrigger className="h-8 w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OPEN">OPEN</SelectItem>
                <SelectItem value="PENDING">PENDING</SelectItem>
                <SelectItem value="RESOLVED">RESOLVED</SelectItem>
                <SelectItem value="CLOSED">CLOSED</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* comments */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {comments.length === 0 ? (
            <div className="text-sm text-muted-foreground">No comments yet.</div>
          ) : (
            comments.map((c: any) => (
              <div key={c.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">
                    {c.userId ?? c.authorId ?? "user"} •{" "}
                    {c.createdAt ? new Date(c.createdAt).toLocaleString() : ""}
                  </div>
                  {c.isAi ? <Badge variant="secondary">AI</Badge> : null}
                </div>
                <div className="mt-2 whitespace-pre-wrap text-sm">{pickCommentText(c)}</div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* composer */}
      <div className="border-t p-4 space-y-2">
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Write a comment…"
        />
        <div className="flex justify-end">
          <Button onClick={submitComment} disabled={addComment.isPending} className="gap-2">
            {addComment.isPending ? "Posting…" : "Post comment"}
          </Button>
        </div>
      </div>
    </div>
  );
}
