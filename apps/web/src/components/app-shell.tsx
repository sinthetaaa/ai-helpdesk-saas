"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Settings, Ticket, BarChart3, Search, LogOut } from "lucide-react";

import { cn } from "@/lib/utils";
import { storage } from "@/lib/storage";
import { TenantSwitcher } from "@/components/tenant-switcher";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const nav = [
  { href: "/tickets", label: "Tickets", icon: Ticket },
  { href: "/kb", label: "Knowledge Base", icon: BookOpen },
  { href: "/usage", label: "Usage", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function openCommandPalette() {
  // Your CommandPalette listens on window keydown for (meta/ctrl)+k.
  // Trigger the exact same event so both click + keyboard work.
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
  window.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "k",
      metaKey: isMac,
      ctrlKey: !isMac,
      bubbles: true,
    })
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        <aside className="hidden md:flex w-64 flex-col border-r min-h-screen">
          <div className="p-4">
            <div className="text-sm font-semibold tracking-tight">AI Helpdesk</div>
            <div className="text-xs text-muted-foreground">AI-Powered Support Solutions</div>
          </div>

          <Separator />

          <nav className="p-2 space-y-1">
            {nav.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition",
                    active
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto p-3">
            <Button
              variant="ghost"
              className="w-full justify-start gap-2"
              onClick={() => {
                storage.clearToken();
                storage.clearTenantId();
                location.href = "/login";
              }}
            >
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </div>
        </aside>

        <div className="flex-1">
          <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
            <div className="flex h-14 items-center justify-between px-4">
              <div className="flex items-center gap-3">
                <TenantSwitcher />

                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2"
                  onClick={openCommandPalette}
                >
                  <Search className="h-4 w-4" />
                  <span className="text-muted-foreground">Search</span>
                  <span className="ml-2 text-xs text-muted-foreground border rounded px-1.5 py-0.5">
                    ⌘K
                  </span>
                </Button>
              </div>
            </div>
          </header>

          <main className="p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
