"use client";

import * as React from "react";
import Link from "next/link";
import { Upload, RefreshCcw, Copy, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useKbSources, useUploadKbSource } from "@/lib/queries/kb";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

function normalizeSources(data: unknown): any[] {
  // supports: []  OR  { sources: [] }  OR  { items: [] }
  if (Array.isArray(data)) return data;
  const obj: any = data ?? {};
  if (Array.isArray(obj.sources)) return obj.sources;
  if (Array.isArray(obj.items)) return obj.items;
  if (Array.isArray(obj.data)) return obj.data;
  return [];
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

export default function KbPage() {
  const { data, isLoading, refetch, isFetching } = useKbSources();
  const upload = useUploadKbSource();

  const sources = React.useMemo(() => normalizeSources(data) as any[], [data]);

  const [q, setQ] = React.useState("");
  const filtered = React.useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return sources;
    return sources.filter((x) => {
      const filename = String(x.filename ?? x.name ?? "").toLowerCase();
      const id = String(x.id ?? "").toLowerCase();
      const err = String(x.error ?? "").toLowerCase();
      return filename.includes(s) || id.includes(s) || err.includes(s);
    });
  }, [sources, q]);

  const counts = React.useMemo(() => {
    const c = { READY: 0, FAILED: 0, INDEXING: 0, QUEUED: 0, OTHER: 0 };
    for (const s of sources) {
      const st = String(s.status ?? "OTHER");
      if (st in c) (c as any)[st] += 1;
      else c.OTHER += 1;
    }
    return c;
  }, [sources]);

  const [open, setOpen] = React.useState(false);

  async function onFile(file: File) {
    try {
      await upload.mutateAsync(file);
      toast.success("Uploaded. Indexing started.");
      setOpen(false);
      setTimeout(() => refetch(), 600);
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Upload failed");
    }
  }

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-2xl font-semibold">Knowledge Base</div>
          <div className="text-sm text-muted-foreground">
            Upload → index → verify retrieval → use in Assist with citations
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-2"
          >
            <RefreshCcw className="h-4 w-4" />
            {isFetching ? "Refreshing…" : "Refresh"}
          </Button>

          <Button onClick={() => setOpen(true)} className="gap-2">
            <Upload className="h-4 w-4" />
            Upload source
          </Button>
        </div>
      </div>

      {/* stats */}
      <div className="grid gap-3 md:grid-cols-4">
        <StatCard label="Total" value={sources.length} />
        <StatCard label="Ready" value={counts.READY} />
        <StatCard label="Indexing/Queued" value={counts.INDEXING + counts.QUEUED} />
        <StatCard label="Failed" value={counts.FAILED} />
      </div>

      {/* search */}
      <Card className="p-3 flex items-center gap-3">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search sources by filename, id, error…"
        />
        <Button
          variant="secondary"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-2"
        >
          <RefreshCcw className="h-4 w-4" />
          {isFetching ? "Refreshing…" : "Refresh"}
        </Button>
      </Card>

      {/* table */}
      <Card className="overflow-hidden">
        <div className="border-b p-3 text-sm text-muted-foreground flex items-center justify-between">
          <span>{isLoading ? "Loading…" : `${filtered.length} sources`}</span>
          <span className="text-xs">Tip: refresh while indexing</span>
        </div>

        <div className="p-2">
          {isLoading ? (
            <div className="space-y-2 p-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center">
              <div className="text-lg font-semibold">No KB sources yet</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Upload PDFs or text files. We’ll chunk, embed, and make them searchable.
              </div>
            </div>
          ) : (
            <SourcesTable rows={filtered} onChanged={() => refetch()} />
          )}
        </div>
      </Card>

      {/* upload dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload KB source</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <UploadDropzone disabled={upload.isPending} onPick={(f) => onFile(f)} />

            {upload.isPending ? (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">Uploading…</div>
                <Progress value={70} />
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                Tip: PDFs and text files work great. Indexing runs async via worker.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UploadDropzone({
  onPick,
  disabled,
}: {
  onPick: (file: File) => void;
  disabled?: boolean;
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [drag, setDrag] = React.useState(false);

  function openPicker() {
    inputRef.current?.click();
  }

  function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    onPick(files[0]);
  }

  return (
    <div>
      <button
        type="button"
        disabled={disabled}
        onClick={openPicker}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDrag(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDrag(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDrag(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onPick(f);
        }}
        className={cn(
          "w-full rounded-lg border p-6 text-left transition",
          "hover:bg-muted/40 disabled:opacity-60",
          drag ? "border-primary bg-muted/50" : "border-border"
        )}
      >
        <div className="text-sm font-medium">Drop a file here</div>
        <div className="mt-1 text-xs text-muted-foreground">or click to choose a file</div>
      </button>

      <input ref={inputRef} type="file" className="hidden" onChange={(e) => onFiles(e.target.files)} />
    </div>
  );
}

function SourcesTable({ rows, onChanged }: { rows: any[]; onChanged: () => void }) {
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Copy failed");
    }
  }

  async function remove(id: string) {
    const ok = window.confirm(
      "Remove this KB source? This will delete the file + embeddings and cannot be undone."
    );
    if (!ok) return;

    setDeletingId(id);
    try {
      await api.delete(`/kb/sources/${id}`);
      toast.success("Source removed");
      onChanged();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Remove failed");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Source</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Size</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Indexed</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>

      <TableBody>
        {rows.map((s) => {
          const id = String(s.id);
          const isDeleting = deletingId === id;

          return (
            <TableRow key={id} className="align-top">
              <TableCell className="max-w-[420px]">
                <div className="font-medium truncate">{s.filename ?? s.name ?? "—"}</div>
                <div className="text-xs text-muted-foreground truncate">{id}</div>
                {s.error ? (
                  <div className="mt-1 text-xs text-red-400 truncate">{String(s.error)}</div>
                ) : null}
              </TableCell>

              <TableCell>
                <StatusPill s={s.status} />
              </TableCell>

              <TableCell className="text-sm">{bytes(s.sizeBytes ?? s.size_bytes)}</TableCell>

              <TableCell className="text-sm text-muted-foreground">
                {safeDate(s.createdAt ?? s.created_at)}
              </TableCell>

              <TableCell className="text-sm text-muted-foreground">
                {s.indexedAt || s.indexed_at ? safeDate(s.indexedAt ?? s.indexed_at) : "—"}
              </TableCell>

              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button asChild size="sm" variant="outline" className="gap-2" disabled={isDeleting}>
                    <Link href={`/kb/${id}`}>
                      <ExternalLink className="h-4 w-4" />
                      Open
                    </Link>
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    onClick={() => copy(id)}
                    disabled={isDeleting}
                  >
                    <Copy className="h-4 w-4" />
                    Copy ID
                  </Button>

                  <Button
                    size="sm"
                    variant="destructive"
                    className="gap-2"
                    onClick={() => remove(id)}
                    disabled={isDeleting}
                  >
                    <Trash2 className="h-4 w-4" />
                    {isDeleting ? "Removing…" : "Remove"}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </Card>
  );
}
