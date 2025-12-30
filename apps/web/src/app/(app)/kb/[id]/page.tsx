"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Copy, RefreshCcw, Trash2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

function bytes(n: unknown) {
  const num = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(num)) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = num;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function safeDate(d: unknown) {
  if (!d) return "—";
  const dt = new Date(String(d));
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString();
}

function StatusPill({ s }: { s: any }) {
  const val = (s ?? "QUEUED").toString();
  const cls =
    val === "READY"
      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
      : val === "FAILED"
        ? "bg-red-500/10 text-red-400 border-red-500/20"
        : "bg-amber-500/10 text-amber-400 border-amber-500/20";

  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs", cls)}>
      {val}
    </span>
  );
}

function normalizeArray(data: unknown): any[] {
  if (Array.isArray(data)) return data;
  const obj: any = data ?? {};
  if (Array.isArray(obj.items)) return obj.items;
  if (Array.isArray(obj.results)) return obj.results;
  if (Array.isArray(obj.data)) return obj.data;
  return [];
}

export default function KbSourcePage() {
  const router = useRouter();
  const params = useParams();
  const id = Array.isArray((params as any)?.id) ? (params as any).id[0] : (params as any)?.id;

  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);

  const [source, setSource] = React.useState<any>(null);

  // retrieval tester
  const [query, setQuery] = React.useState("");
  const [topK, setTopK] = React.useState(5);
  const [searching, setSearching] = React.useState(false);
  const [results, setResults] = React.useState<any[]>([]);

  async function load(showSpinner = true) {
    if (!id) return;
    try {
      if (showSpinner) setLoading(true);
      const r = await api.get(`/kb/sources/${id}`);
      setSource(r.data ?? null);
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Failed to load source");
      setSource(null);
    } finally {
      if (showSpinner) setLoading(false);
    }
  }

  React.useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function refresh() {
    setRefreshing(true);
    await load(false);
    setRefreshing(false);
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Copy failed");
    }
  }

  async function runQuery() {
    const q = query.trim();
    if (!q) return toast.error("Enter a query to test retrieval");
    setSearching(true);
    try {
      const r = await api.post("/kb/query", { query: q, topK });
      setResults(normalizeArray(r.data));
      toast.success("Retrieved chunks");
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Query failed");
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function retryIndex() {
    try {
      await api.post(`/kb/sources/${id}/retry`);
      toast.success("Retry queued");
      await refresh();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Retry failed");
    }
  }

  async function remove() {
    const ok = window.confirm("Delete this KB source? This will delete file + embeddings and cannot be undone.");
    if (!ok) return;

    try {
      await api.delete(`/kb/sources/${id}`);
      toast.success("Source deleted");
      router.push("/kb");
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Delete failed");
    }
  }

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm" className="gap-2">
            <Link href="/kb">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>
          <div>
            <div className="text-2xl font-semibold">KB Source</div>
            <div className="text-sm text-muted-foreground">
              Inspect status + test retrieval (RAG verification)
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={refresh} disabled={refreshing} className="gap-2">
            <RefreshCcw className="h-4 w-4" />
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>

          <Button variant="secondary" onClick={retryIndex} className="gap-2">
            <RotateCcw className="h-4 w-4" />
            Retry indexing
          </Button>

          <Button variant="outline" onClick={() => copy(String(id))} className="gap-2">
            <Copy className="h-4 w-4" />
            Copy ID
          </Button>

          <Button variant="destructive" onClick={remove} className="gap-2">
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      {/* source meta */}
      <Card className="p-4">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : !source ? (
          <div className="text-sm text-muted-foreground">Source not found.</div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-lg font-semibold truncate">{source.filename ?? "—"}</div>
                <div className="text-xs text-muted-foreground font-mono truncate">{source.id}</div>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill s={source.status} />
                {source.mimeType ? <Badge variant="outline">{source.mimeType}</Badge> : null}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <Mini label="Size" value={bytes(source.sizeBytes ?? source.size_bytes)} />
              <Mini label="Created" value={safeDate(source.createdAt ?? source.created_at)} />
              <Mini label="Indexed" value={safeDate(source.indexedAt ?? source.indexed_at)} />
              <Mini
                label="Job"
                value={
                  source.latestJob?.status ? (
                    <Badge variant="secondary" className="text-[10px]">
                      {source.latestJob.status}
                    </Badge>
                  ) : (
                    "—"
                  )
                }
              />
            </div>

            {source.error ? (
              <div className="rounded-md border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-300">
                {String(source.error)}
              </div>
            ) : null}
          </div>
        )}
      </Card>

      {/* retrieval test */}
      <Card className="p-4 space-y-3">
        <div className="text-sm font-medium">Test retrieval</div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a question to test KB retrieval…"
            className="min-w-[320px] flex-1"
          />

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTopK((k) => Math.max(1, k - 1))}
            >
              -
            </Button>
            <div className="text-sm w-8 text-center">{topK}</div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTopK((k) => Math.min(20, k + 1))}
            >
              +
            </Button>
          </div>

          <Button onClick={runQuery} disabled={searching} className="gap-2">
            {searching ? "Searching…" : "Search"}
          </Button>
        </div>

        <Separator />

        {results.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            Run a query to see the most similar chunks + similarity score.
          </div>
        ) : (
          <div className="space-y-3">
            {results.map((r, idx) => (
              <Card key={r.chunkId ?? r.id ?? String(idx)} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {r.filename ?? "chunk"}{" "}
                      <span className="text-xs text-muted-foreground">
                        • idx {r.idx ?? "—"}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      similarity:{" "}
                      <span className="font-mono">
                        {typeof r.similarity === "number" ? r.similarity.toFixed(3) : "—"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => copy(String(r.chunkId ?? r.id ?? ""))}
                    >
                      <Copy className="h-4 w-4" />
                      Copy chunkId
                    </Button>
                  </div>
                </div>

                <div className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">
                  {r.snippet ?? (r.content ? String(r.content).slice(0, 260) : "—")}
                </div>

                {r.content ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-muted-foreground">
                      Show full chunk
                    </summary>
                    <pre className="mt-2 max-h-64 overflow-auto rounded-md border p-3 text-xs text-muted-foreground whitespace-pre-wrap">
                      {String(r.content)}
                    </pre>
                  </details>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}
