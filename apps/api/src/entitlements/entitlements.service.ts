import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

type EntitlementLimits = {
  maxAgents?: number;
  maxKbSources?: number;
  maxAiMsgsPerMonth?: number;
};

@Injectable()
export class EntitlementsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Ensure entitlement row exists for tenant.
   * Defaults come from schema defaults.
   */
  async getOrCreateEntitlement(tenantId: string) {
    return this.prisma.entitlement.upsert({
      where: { tenantId },
      update: {},
      create: { tenantId },
    });
  }

  /**
   * (Optional) Manual override for limits.
   * Useful for local dev / admin tooling even without billing.
   * If you don't want ANY mutation endpoint, you can delete this method.
   */
  async setLimits(tenantId: string, limits: EntitlementLimits) {
    const check = (v: unknown, name: string) => {
      if (v === undefined || v === null) return;
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || Math.floor(v) !== v) {
        throw new BadRequestException(`${name} must be a non-negative integer`);
      }
    };

    check(limits.maxAgents, "maxAgents");
    check(limits.maxKbSources, "maxKbSources");
    check(limits.maxAiMsgsPerMonth, "maxAiMsgsPerMonth");

    await this.getOrCreateEntitlement(tenantId);

    return this.prisma.entitlement.update({
      where: { tenantId },
      data: {
        ...(limits.maxAgents !== undefined ? { maxAgents: limits.maxAgents } : {}),
        ...(limits.maxKbSources !== undefined ? { maxKbSources: limits.maxKbSources } : {}),
        ...(limits.maxAiMsgsPerMonth !== undefined
          ? { maxAiMsgsPerMonth: limits.maxAiMsgsPerMonth }
          : {}),
      },
    });
  }

  private getCurrentMonthWindowUtc() {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));
    return { start, end };
  }

  async assertCanUseAiOrThrow(tenantId: string) {
    const ent = await this.getOrCreateEntitlement(tenantId);
    const { start, end } = this.getCurrentMonthWindowUtc();

    const agg = await this.prisma.usageEvent.aggregate({
      where: {
        tenantId,
        type: "AI_ASSIST_CALL",
        createdAt: { gte: start, lt: end },
      },
      _sum: { amount: true },
    });

    const used = agg._sum.amount ?? 0;
    if (used >= ent.maxAiMsgsPerMonth) {
      throw new ForbiddenException(`AI monthly quota exceeded (${used}/${ent.maxAiMsgsPerMonth}).`);
    }
  }

  async assertCanAddKbSourceOrThrow(tenantId: string) {
    const ent = await this.getOrCreateEntitlement(tenantId);

    const count = await this.prisma.knowledgeSource.count({ where: { tenantId } });
    if (count >= ent.maxKbSources) {
      throw new ForbiddenException(`KB source limit reached (${count}/${ent.maxKbSources}).`);
    }
  }

  async assertCanAddMemberOrThrow(tenantId: string) {
    const ent = await this.getOrCreateEntitlement(tenantId);

    const count = await this.prisma.membership.count({ where: { tenantId } });
    if (count >= ent.maxAgents) {
      throw new ForbiddenException(`Member/seat limit reached (${count}/${ent.maxAgents}).`);
    }
  }
}
