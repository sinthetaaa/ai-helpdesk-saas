import { Injectable } from "@nestjs/common";
import { UsageEventType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

function isValidMonthYYYYMM(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) return false;
  const m = Number(month.slice(5, 7));
  return m >= 1 && m <= 12;
}

function currentMonthYYYYMM() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthBoundsUTC(monthYYYYMM?: string) {
  const safe = monthYYYYMM && isValidMonthYYYYMM(monthYYYYMM) ? monthYYYYMM : currentMonthYYYYMM();
  const y = Number(safe.slice(0, 4));
  const m = Number(safe.slice(5, 7)); // 1..12

  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  return { month: safe, start, end };
}

@Injectable()
export class UsageService {
  constructor(private prisma: PrismaService) {}

  async ensureEntitlement(tenantId: string) {
    return this.prisma.entitlement.upsert({
      where: { tenantId },
      update: {},
      create: { tenantId },
    });
  }

  async getSummary(tenantId: string, month?: string) {
    const { start, end } = monthBoundsUTC(month);

    const ent = await this.ensureEntitlement(tenantId);

    // usage totals for the month
    const usageRows = await this.prisma.usageEvent.groupBy({
      by: ["type"],
      where: {
        tenantId,
        createdAt: { gte: start, lt: end },
      },
      _sum: { amount: true },
      _count: { _all: true },
    });

    const usage: Record<string, { amount: number; events: number }> = {};
    for (const t of Object.values(UsageEventType)) {
      usage[t] = { amount: 0, events: 0 };
    }
    for (const r of usageRows) {
      usage[r.type] = {
        amount: r._sum.amount ?? 0,
        events: r._count._all ?? 0,
      };
    }

    // “counts” for quotas
    const [kbSourcesCount, membersCount] = await this.prisma.$transaction([
      this.prisma.knowledgeSource.count({ where: { tenantId } }),
      this.prisma.membership.count({ where: { tenantId } }),
    ]);

    return {
      period: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
      entitlement: {
        maxAgents: ent.maxAgents,
        maxKbSources: ent.maxKbSources,
        maxAiMsgsPerMonth: ent.maxAiMsgsPerMonth,
      },
      counts: {
        kbSources: kbSourcesCount,
        members: membersCount,
      },
      usage,
    };
  }
}
