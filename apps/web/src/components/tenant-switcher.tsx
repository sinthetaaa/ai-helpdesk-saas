"use client";

import * as React from "react";
import { ChevronDown, Plus } from "lucide-react";
import { toast } from "sonner";

import { storage } from "@/lib/storage";
import { useCreateTenant, useMyTenants } from "@/lib/queries/tenants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function TenantSwitcher() {
  const { data, isLoading } = useMyTenants();
  const createTenant = useCreateTenant();

  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");

  // ✅ Prevent SSR/CSR mismatch (localStorage + react-query data can differ on server)
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const selectedId = mounted ? storage.getTenantId() : null;
  const selected = (data ?? []).find((t) => t.id === selectedId) ?? (data ?? [])[0];

  React.useEffect(() => {
    if (!mounted) return;
    if (!selectedId && data?.[0]) storage.setTenantId(data[0].id);
  }, [mounted, selectedId, data]);

  async function onCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;

    try {
      const t = await createTenant.mutateAsync(trimmed);
      storage.setTenantId(t.id);
      toast.success("Workspace created");
      setOpen(false);
      setName("");
      location.reload(); // simple & consistent
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Failed to create workspace");
    }
  }

  // Render stable placeholder on server + first client paint
  if (!mounted) {
    return (
      <Button variant="secondary" size="sm" className="gap-2" disabled>
        <span className="max-w-[160px] truncate">Loading…</span>
        <ChevronDown className="h-4 w-4 opacity-70" />
      </Button>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="sm" className="gap-2">
            <span className="max-w-[160px] truncate">
              {isLoading ? "Loading…" : selected?.name ?? "Select workspace"}
            </span>
            <ChevronDown className="h-4 w-4 opacity-70" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Workspace</DropdownMenuLabel>
          <DropdownMenuSeparator />

          {(data ?? []).map((t) => (
            <DropdownMenuItem
              key={t.id}
              onClick={() => {
                storage.setTenantId(t.id);
                location.reload();
              }}
              className="flex items-center justify-between"
            >
              <span className="truncate">{t.name}</span>
              {t.id === selected?.id ? (
                <span className="text-xs opacity-60">Current</span>
              ) : null}
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create workspace</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Acme" value={name} onChange={(e) => setName(e.target.value)} />
            <Button onClick={onCreate} disabled={createTenant.isPending}>
              {createTenant.isPending ? "Creating…" : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
