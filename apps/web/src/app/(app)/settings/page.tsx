"use client";

import * as React from "react";
import { Plus, RefreshCcw, Copy, Trash2, Link2 } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type TenantMe = {
  tenantId?: string | null;
  name?: string | null;
  role?: string | null;
  userId?: string | null;
};

type Member = {
  userId?: string;
  email?: string;
  role?: string;
  createdAt?: string;
};

type InviteRow = {
  id?: string;
  email?: string | null;
  role?: string;
  createdAt?: string;
  expiresAt?: string;
  createdBy?: string;
};

type AuditRow = {
  id?: string;
  action?: string;
  actorId?: string;
  createdAt?: string;
  meta?: any;
};

function normalizeArray(data: unknown): any[] {
  if (Array.isArray(data)) return data;
  const obj: any = data ?? {};
  if (Array.isArray(obj.items)) return obj.items;
  if (Array.isArray(obj.members)) return obj.members;
  if (Array.isArray(obj.audit)) return obj.audit;
  if (Array.isArray(obj.data)) return obj.data;
  return [];
}

function safeDate(d: unknown) {
  if (!d) return "—";
  const dt = new Date(String(d));
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString();
}

export default function SettingsPage() {
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);

  const [me, setMe] = React.useState<TenantMe | null>(null);
  const [members, setMembers] = React.useState<Member[]>([]);
  const [invites, setInvites] = React.useState<InviteRow[]>([]);
  const [audit, setAudit] = React.useState<AuditRow[]>([]);

  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<"ADMIN" | "AGENT" | "VIEWER">("AGENT");
  const [inviting, setInviting] = React.useState(false);

  const [inviteActionId, setInviteActionId] = React.useState<string | null>(null);

  async function loadAll(showSpinner = true) {
    try {
      if (showSpinner) setLoading(true);

      const [meRes, memRes, invRes, auditRes] = await Promise.allSettled([
        api.get("/tenants/current"),
        api.get("/tenants/members"),
        api.get("/tenants/invites"),
        api.get("/tenants/audit"),
      ]);

      if (meRes.status === "fulfilled") setMe((meRes.value.data ?? null) as any);
      else setMe(null);

      if (memRes.status === "fulfilled") setMembers(normalizeArray(memRes.value.data) as any);
      else setMembers([]);

      if (invRes.status === "fulfilled") setInvites(normalizeArray(invRes.value.data) as any);
      else setInvites([]);

      if (auditRes.status === "fulfilled") setAudit(normalizeArray(auditRes.value.data) as any);
      else setAudit([]);
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Failed to load settings");
    } finally {
      if (showSpinner) setLoading(false);
    }
  }

  React.useEffect(() => {
    loadAll(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    setRefreshing(true);
    await loadAll(false);
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

  function tokenToLink(token: string) {
    return `${location.origin}/accept-invite?token=${encodeURIComponent(token)}`;
  }

  async function createInvite() {
    const email = inviteEmail.trim();
    if (!email) return toast.error("Email is required");

    setInviting(true);
    try {
      const r = await api.post("/tenants/invites", { email, role: inviteRole });
      toast.success("Invite created");

      const token =
        (r.data?.token ?? r.data?.inviteToken ?? r.data?.invite?.token ?? null) as string | null;

      if (token) {
        const link = tokenToLink(token);
        await copy(link);
        toast.success("Invite link copied");
      }

      setInviteOpen(false);
      setInviteEmail("");
      setInviteRole("AGENT");
      await refresh();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Invite failed");
    } finally {
      setInviting(false);
    }
  }

  async function reissueAndCopy(inviteId: string) {
    setInviteActionId(inviteId);
    try {
      const r = await api.post(`/tenants/invites/${inviteId}/reissue`, {});
      const token = (r.data?.token ?? null) as string | null;
      if (!token) throw new Error("No token returned");
      await copy(tokenToLink(token));
      toast.success("Invite link copied");
      await refresh();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? e?.message ?? "Copy link failed");
    } finally {
      setInviteActionId(null);
    }
  }

  async function revokeInvite(inviteId: string) {
    const ok = window.confirm("Revoke this invite? (It will stop working immediately.)");
    if (!ok) return;

    setInviteActionId(inviteId);
    try {
      await api.delete(`/tenants/invites/${inviteId}`);
      toast.success("Invite revoked");
      await refresh();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Revoke failed");
    } finally {
      setInviteActionId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-2xl font-semibold">Settings</div>
          <div className="text-sm text-muted-foreground">Members, invites, audit</div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={refresh} disabled={refreshing} className="gap-2">
            <RefreshCcw className="h-4 w-4" />
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>

          <Button onClick={() => setInviteOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Invite member
          </Button>
        </div>
      </div>

      {/* tenant card */}
      <Card className="p-4">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="text-sm font-medium">Current tenant</div>
              <div className="text-sm text-muted-foreground">
                {me?.name ?? "—"} <span className="opacity-60">•</span> tenantId:{" "}
                <span className="font-mono">{me?.tenantId ?? "—"}</span>{" "}
                <span className="opacity-60">•</span> role:{" "}
                <span className="font-mono">{me?.role ?? "—"}</span>
              </div>
            </div>

            {me?.tenantId ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => copy(String(me.tenantId))}
              >
                <Copy className="h-4 w-4" />
                Copy tenantId
              </Button>
            ) : null}
          </div>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* left column */}
        <div className="space-y-4">
          {/* members */}
          <Card className="overflow-hidden">
            <div className="border-b p-3 text-sm text-muted-foreground flex items-center justify-between">
              <span>Members</span>
              <span className="text-xs">{loading ? "…" : `${members.length}`}</span>
            </div>

            <div className="p-2">
              {loading ? (
                <div className="space-y-2 p-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : members.length === 0 ? (
                <div className="p-8 text-sm text-muted-foreground">No members found.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Added</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((m, idx) => (
                      <TableRow key={(m.userId ?? m.email ?? String(idx)) as string}>
                        <TableCell className="max-w-[220px]">
                          <div className="truncate font-medium">{m.email ?? m.userId ?? "—"}</div>
                          {m.userId ? (
                            <div className="truncate text-xs text-muted-foreground font-mono">
                              {m.userId}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{m.role ?? "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {safeDate(m.createdAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </Card>

          {/* invites */}
          <Card className="overflow-hidden">
            <div className="border-b p-3 text-sm text-muted-foreground flex items-center justify-between">
              <span>Pending invites</span>
              <span className="text-xs">{loading ? "…" : `${invites.length}`}</span>
            </div>

            <div className="p-2">
              {loading ? (
                <div className="space-y-2 p-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : invites.length === 0 ? (
                <div className="p-8 text-sm text-muted-foreground">
                  No pending invites.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invites.map((inv, idx) => {
                      const id = String(inv.id ?? idx);
                      const busy = inviteActionId === id;
                      return (
                        <TableRow key={id}>
                          <TableCell className="max-w-[240px]">
                            <div className="truncate font-medium">{inv.email ?? "—"}</div>
                            <div className="truncate text-xs text-muted-foreground font-mono">{id}</div>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{inv.role ?? "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {safeDate(inv.expiresAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-2"
                                disabled={busy}
                                onClick={() => reissueAndCopy(id)}
                              >
                                <Link2 className="h-4 w-4" />
                                {busy ? "…" : "Copy link"}
                              </Button>

                              <Button
                                size="sm"
                                variant="destructive"
                                className="gap-2"
                                disabled={busy}
                                onClick={() => revokeInvite(id)}
                              >
                                <Trash2 className="h-4 w-4" />
                                {busy ? "…" : "Revoke"}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          </Card>
        </div>

        {/* audit */}
        <Card className="overflow-hidden">
          <div className="border-b p-3 text-sm text-muted-foreground flex items-center justify-between">
            <span>Audit log</span>
            <span className="text-xs">{loading ? "…" : `${audit.length}`}</span>
          </div>

          <div className="p-2">
            {loading ? (
              <div className="space-y-2 p-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : audit.length === 0 ? (
              <div className="p-8 text-sm text-muted-foreground">
                No audit entries yet (once you log actions, they’ll show up here).
              </div>
            ) : (
              <div className="space-y-2 p-2">
                {audit.slice(0, 50).map((a, idx) => (
                  <div key={a.id ?? String(idx)} className="rounded-md border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{a.action ?? "—"}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          actor: <span className="font-mono">{a.actorId ?? "—"}</span> •{" "}
                          {safeDate(a.createdAt)}
                        </div>
                      </div>
                      {a.id ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={() => copy(String(a.id))}
                        >
                          <Copy className="h-4 w-4" /> Copy
                        </Button>
                      ) : null}
                    </div>

                    {a.meta ? (
                      <>
                        <Separator className="my-3" />
                        <pre className={cn("text-xs text-muted-foreground overflow-auto max-h-40")}>
                          {JSON.stringify(a.meta, null, 2)}
                        </pre>
                      </>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite member</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <Input
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="Email"
            />

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Role</div>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">ADMIN</SelectItem>
                  <SelectItem value="AGENT">AGENT</SelectItem>
                  <SelectItem value="VIEWER">VIEWER</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button onClick={createInvite} disabled={inviting} className="w-full">
              {inviting ? "Creating…" : "Create invite"}
            </Button>

            <div className="text-xs text-muted-foreground">
              We copy a link immediately. You can also “Copy link” later from Pending invites (reissues token).
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
