"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

import { useTickets } from "@/lib/queries/tickets";
import { cn } from "@/lib/utils";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";

export function CommandPalette() {
  const router = useRouter();
  const { data: tickets = [], isLoading } = useTickets();

  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");

  // ⌘K / Ctrl+K
  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isK = e.key.toLowerCase() === "k";
      const mod = e.metaKey || e.ctrlKey;
      if (mod && isK) {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const filtered = React.useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return tickets.slice(0, 30);
    return tickets
      .filter((t) => {
        const title = (t.title ?? "").toLowerCase();
        const desc = (t.description ?? "").toLowerCase();
        return title.includes(query) || desc.includes(query);
      })
      .slice(0, 50);
  }, [tickets, q]);

  function goTicket(id: string) {
    setOpen(false);
    setQ("");
    router.push(`/tickets?id=${id}`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 overflow-hidden max-w-[720px]">
        {/* Required for accessibility */}
        <DialogHeader>
          <VisuallyHidden>
            <DialogTitle>Command palette</DialogTitle>
          </VisuallyHidden>
        </DialogHeader>

        {/* NOTE: pr-14 reserves space for the built-in close button */}
        <div className="flex items-center gap-2 border-b px-4 py-3 pr-14">
          <Search className="h-4 w-4 text-muted-foreground" />
          <div className="text-sm font-medium">Search</div>

          {/* clickable shortcut hint */}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open command palette"
            className="ml-auto flex items-center gap-2 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">⌘ K</kbd>
            <span className="opacity-70">/</span>
            <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
              Ctrl K
            </kbd>
          </button>
        </div>

        <Command shouldFilter={false} className="rounded-none">
          <CommandInput
            value={q}
            onValueChange={setQ}
            placeholder="Search tickets…"
            className={cn("h-12")}
            autoFocus
          />

          <CommandList className="max-h-[420px]">
            <CommandEmpty>{isLoading ? "Loading…" : "No results."}</CommandEmpty>

            <CommandGroup heading="Tickets">
              {filtered.map((t) => (
                <CommandItem
                  key={t.id}
                  value={t.id}
                  onSelect={() => goTicket(t.id)}
                  className="flex items-start gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{t.title}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {t.description ?? "—"}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">
                      {t.status ?? "OPEN"}
                    </Badge>
                    {t.priority ? (
                      <Badge variant="outline" className="text-[10px]">
                        {t.priority}
                      </Badge>
                    ) : null}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
