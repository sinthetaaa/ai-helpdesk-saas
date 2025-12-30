"use client";

import * as React from "react";
import { Sparkles, Copy, Send, Link2, ThumbsUp, ThumbsDown, MessageSquare } from "lucide-react";
import { toast } from "sonner";

import { useAssist } from "@/lib/queries/assist";
import { useAiFeedback } from "@/lib/queries/feedback";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
import { Textarea } from "@/components/ui/textarea";

type Tone = "neutral" | "friendly" | "firm";

export function AssistDrawer({ ticketId }: { ticketId: string }) {
  const assist = useAssist(ticketId);

  const feedback = useAiFeedback();
  const [fbOpen, setFbOpen] = React.useState(false);
  const [fbText, setFbText] = React.useState("");

  const [open, setOpen] = React.useState(false);
  const [tone, setTone] = React.useState<Tone>("neutral");
  const [topK, setTopK] = React.useState(5);
  const [dryRun, setDryRun] = React.useState(true);

  const data = assist.data;

  async function run() {
    try {
      await assist.mutateAsync({ topK, tone, dryRun });
      toast.success(dryRun ? "Draft generated" : "Saved as comment");
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Assist failed");
    }
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  }

  async function sendFeedback(rating: "UP" | "DOWN") {
    try {
      await feedback.mutateAsync({
        ticketId,
        rating,
        comment: fbText.trim() || undefined,
      });
      toast.success("Feedback saved");
      setFbOpen(false);
      setFbText("");
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Feedback failed");
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="secondary" className="gap-2">
          <Sparkles className="h-4 w-4" />
          Assist
        </Button>
      </SheetTrigger>

      <SheetContent side="right" className="w-[520px] sm:w-[620px] p-0">
        <SheetHeader className="p-4">
          <SheetTitle className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" /> AI Assist
            </span>
            <Badge variant="secondary">RAG</Badge>
          </SheetTitle>
        </SheetHeader>

        <Separator />

        {/* Controls */}
        <div className="p-4 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm text-muted-foreground">Tone</span>
            <Toggle pressed={tone === "neutral"} onPressedChange={() => setTone("neutral")}>
              Neutral
            </Toggle>
            <Toggle pressed={tone === "friendly"} onPressedChange={() => setTone("friendly")}>
              Friendly
            </Toggle>
            <Toggle pressed={tone === "firm"} onPressedChange={() => setTone("firm")}>
              Firm
            </Toggle>

            <span className="ml-4 text-sm text-muted-foreground">TopK</span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTopK((k) => Math.max(1, k - 1))}
              >
                -
              </Button>
              <div className="text-sm w-6 text-center">{topK}</div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTopK((k) => Math.min(12, k + 1))}
              >
                +
              </Button>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <Button variant={dryRun ? "secondary" : "default"} size="sm" onClick={() => setDryRun(true)}>
                Draft
              </Button>
              <Button variant={!dryRun ? "secondary" : "outline"} size="sm" onClick={() => setDryRun(false)}>
                Save comment
              </Button>
            </div>
          </div>

          <Button onClick={run} disabled={assist.isPending} className="w-full gap-2">
            {assist.isPending ? (
              "Generating…"
            ) : dryRun ? (
              <>
                <Sparkles className="h-4 w-4" /> Generate draft
              </>
            ) : (
              <>
                <Send className="h-4 w-4" /> Generate & save
              </>
            )}
          </Button>

          {data ? (
            <div className="text-xs text-muted-foreground flex items-center justify-between">
              <span>
                kbHits: <b>{data.kbHits}</b> • topK: <b>{data.kbTopK}</b>
              </span>
              <span>{data.commentSaved ? "Saved ✅" : data.commentSkipped ? "Skipped" : "Draft"}</span>
            </div>
          ) : null}
        </div>

        <Separator />

        {/* Output */}
        <ScrollArea className="h-[calc(100vh-240px)]">
          <div className="p-4">
            {!data ? (
              <div className="text-sm text-muted-foreground">
                Generate a draft reply using your KB. Citations will appear here.
              </div>
            ) : (
              <Tabs defaultValue="customer">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="customer">Customer</TabsTrigger>
                  <TabsTrigger value="internal">Internal</TabsTrigger>
                  <TabsTrigger value="next">Next</TabsTrigger>
                </TabsList>

                <TabsContent value="customer" className="mt-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="text-sm font-medium">Customer reply</div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => copy(data.customer_reply)}
                    >
                      <Copy className="h-4 w-4" /> Copy
                    </Button>
                  </div>
                  <div className="rounded-md border p-3 whitespace-pre-wrap text-sm">
                    {data.customer_reply}
                  </div>
                </TabsContent>

                <TabsContent value="internal" className="mt-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="text-sm font-medium">Internal notes</div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => copy(data.internal_notes)}
                    >
                      <Copy className="h-4 w-4" /> Copy
                    </Button>
                  </div>
                  <div className="rounded-md border p-3 whitespace-pre-wrap text-sm">
                    {data.internal_notes}
                  </div>
                </TabsContent>

                <TabsContent value="next" className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Next steps</div>
                    <ul className="list-disc pl-5 text-sm space-y-1">
                      {data.next_steps.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-medium">Questions for customer</div>
                    <ul className="list-disc pl-5 text-sm space-y-1">
                      {data.questions_for_customer.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                </TabsContent>

                <div className="mt-6 space-y-2">
                  <div className="text-sm font-medium">Citations</div>
                  {data.citations.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No citations returned.</div>
                  ) : (
                    <div className="space-y-2">
                      {data.citations.map((c) => (
                        <div
                          key={c.chunkId}
                          className="flex items-center justify-between rounded-md border p-3"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">
                              {c.source} • {c.filename}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">{c.chunkId}</div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => copy(`${c.filename} (${c.chunkId})`)}
                          >
                            <Link2 className="h-4 w-4" /> Copy ref
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Feedback */}
                <div className="mt-6 rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">Was this helpful?</div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => {
                          setFbOpen(false);
                          setFbText("");
                          sendFeedback("UP");
                        }}
                        disabled={feedback.isPending}
                      >
                        <ThumbsUp className="h-4 w-4" />
                        Good
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => setFbOpen((v) => !v)}
                      >
                        <ThumbsDown className="h-4 w-4" />
                        Needs work
                      </Button>
                    </div>
                  </div>

                  {fbOpen ? (
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <MessageSquare className="h-4 w-4" />
                        Tell us what to improve (optional)
                      </div>
                      <Textarea
                        value={fbText}
                        onChange={(e) => setFbText(e.target.value)}
                        placeholder="E.g. missed a condition, citations wrong, tone too harsh..."
                      />
                      <div className="flex justify-end">
                        <Button onClick={() => sendFeedback("DOWN")} disabled={feedback.isPending}>
                          {feedback.isPending ? "Saving…" : "Submit"}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </Tabs>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
