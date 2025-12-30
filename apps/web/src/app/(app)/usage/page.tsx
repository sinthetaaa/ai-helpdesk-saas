"use client";

import * as React from "react";
import { RefreshCcw } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";

type UsageSummary = {
  period: { start: string; end: string };
  entitlement: {
    maxAgents: number;
    maxKbSources: number;
    maxAiMsgsPerMonth: number;
  };
  counts: { kbSources: number; members: number };
  usage: Record<string, { amount: number; events: number }>;
};

function pct(used: number, limit: number) {
  if (!limit || limit <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((used / limit) * 100)));
}

export default function UsagePage() {
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [data, setData] = React.useState<UsageSummary | null>(null);

  async function load(showSpinner = true) {
    try {
      if (showSpinner) setLoading(true);
      const r = await api.get("/usage/summary");
      setData(r.data as UsageSummary);
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Failed to load usage");
    } finally {
      if (showSpinner) setLoading(false);
    }
  }

  React.useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    setRefreshing(true);
    await load(false);
    setRefreshing(false);
  }

  const aiUsed = data?.usage?.AI_ASSIST_CALL?.amount ?? 0;
  const embedUsed = data?.usage?.KB_EMBEDDING?.amount ?? 0;
  const kbSources = data?.counts?.kbSources ?? 0;
  const members = data?.counts?.members ?? 0;

  const maxAi = data?.entitlement?.maxAiMsgsPerMonth ?? 0;
  const maxKb = data?.entitlement?.maxKbSources ?? 0;
  const maxAgents = data?.entitlement?.maxAgents ?? 0;

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-2xl font-semibold">Usage</div>
          <div className="text-sm text-muted-foreground">
            Monthly usage + workspace limits (entitlements)
          </div>
        </div>

        <Button variant="secondary" onClick={refresh} disabled={refreshing} className="gap-2">
          <RefreshCcw className="h-4 w-4" />
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      ) : !data ? (
        <Card className="p-6 text-sm text-muted-foreground">No data.</Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          <QuotaCard
            title="AI assists"
            subtitle="This month"
            used={aiUsed}
            limit={maxAi}
          />

          <QuotaCard
            title="KB sources"
            subtitle="Workspace"
            used={kbSources}
            limit={maxKb}
          />

          <QuotaCard
            title="Members"
            subtitle="Workspace"
            used={members}
            limit={maxAgents}
          />

          <Card className="p-5 md:col-span-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium">Embeddings (KB)</div>
                <div className="text-xs text-muted-foreground">
                  This month (amount = chunks embedded, if you log it)
                </div>
              </div>
              <div className="text-sm font-mono">{embedUsed}</div>
            </div>

            <div className="mt-4 text-xs text-muted-foreground">
              If this shows <span className="font-mono">0</span>, you just need to log events when indexing/AI runs.
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function QuotaCard({
  title,
  subtitle,
  used,
  limit,
}: {
  title: string;
  subtitle: string;
  used: number;
  limit: number;
}) {
  const percent = pct(used, limit);
  const over = limit > 0 && used > limit;

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs text-muted-foreground">{subtitle}</div>
        </div>
        <div className="text-sm font-mono">
          {used}/{limit || "—"}
        </div>
      </div>

      <div className="mt-4">
        <Progress value={percent} />
        <div className={`mt-2 text-xs ${over ? "text-red-400" : "text-muted-foreground"}`}>
          {over ? "Over limit" : `${percent}% used`}
        </div>
      </div>
    </Card>
  );
}
