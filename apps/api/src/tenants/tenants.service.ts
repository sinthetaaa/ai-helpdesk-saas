import type { Role } from "@prisma/client";
import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { randomToken, sha256 } from "../common/crypto/token";
import { EntitlementsService } from "../entitlements/entitlements.service";

@Injectable()
export class TenantsService {
  constructor(
    private prisma: PrismaService,
    private entitlements: EntitlementsService,
  ) {}

  async createTenant(userId: string, name: string) {
    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({ data: { name } });

      await tx.membership.create({
        data: { tenantId: tenant.id, userId, role: "OWNER" },
      });

      // Ensure entitlement row exists for new tenant
      await tx.entitlement.create({
        data: {
          tenantId: tenant.id,
          maxAgents: 3,
          maxKbSources: 10,
          maxAiMsgsPerMonth: 200,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: tenant.id,
          actorId: userId,
          action: "TENANT_CREATED",
          entity: "Tenant",
          entityId: tenant.id,
          meta: { name },
        },
      });

      return tenant;
    });
  }

  async listMyTenants(userId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      include: { tenant: true },
      orderBy: { createdAt: "desc" },
    });
    return memberships.map((m) => ({ tenant: m.tenant, role: m.role }));
  }

  async listMembers(tenantId: string) {
    const members = await this.prisma.membership.findMany({
      where: { tenantId },
      select: {
        role: true,
        createdAt: true,
        user: { select: { id: true, email: true, createdAt: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return members.map((m) => ({
      userId: m.user.id,
      email: m.user.email,
      role: m.role,
      joinedAt: m.createdAt,
    }));
  }

  async createInvite(params: {
    tenantId: string;
    createdBy: string;
    email?: string;
    role: Role;
    ttlHours?: number;
  }) {
    // Only enforce seat limit if the invite will add a real member seat.
    // VIEWER is "free seat" in our model.
    if (params.role !== "VIEWER") {
      await this.entitlements.assertCanAddMemberOrThrow(params.tenantId);
    }

    const ttlHours = params.ttlHours ?? 72;

    const rawToken = randomToken(32);
    const tokenHash = sha256(rawToken);

    const invite = await this.prisma.invite.create({
      data: {
        tenantId: params.tenantId,
        createdBy: params.createdBy,
        email: params.email?.toLowerCase(),
        role: params.role,
        tokenHash,
        expiresAt: new Date(Date.now() + ttlHours * 60 * 60 * 1000),
      },
      select: { id: true, expiresAt: true, role: true, email: true },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: params.tenantId,
        actorId: params.createdBy,
        action: "INVITE_CREATED",
        entity: "Invite",
        entityId: invite.id,
        meta: { email: invite.email, role: invite.role, expiresAt: invite.expiresAt },
      },
    });

    return { inviteId: invite.id, token: rawToken, expiresAt: invite.expiresAt };
  }

  async acceptInvite(params: { userId: string; token: string }) {
    const tokenHash = sha256(params.token);

    const invite = await this.prisma.invite.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        tenantId: true,
        role: true,
        expiresAt: true,
        usedAt: true,
      },
    });

    if (!invite) throw new BadRequestException("Invalid invite token");
    if (invite.usedAt) throw new BadRequestException("Invite already used");
    if (invite.expiresAt.getTime() < Date.now()) throw new BadRequestException("Invite expired");

    // If invite grants a "paid seat" (non-VIEWER), enforce seat limit
    if (invite.role !== "VIEWER") {
      const existing = await this.prisma.membership.findUnique({
        where: { tenantId_userId: { tenantId: invite.tenantId, userId: params.userId } },
        select: { id: true },
      });

      // Only block if they're NOT already a member (updating role shouldn't consume new seat)
      if (!existing) {
        await this.entitlements.assertCanAddMemberOrThrow(invite.tenantId);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.membership.upsert({
        where: { tenantId_userId: { tenantId: invite.tenantId, userId: params.userId } },
        update: { role: invite.role },
        create: { tenantId: invite.tenantId, userId: params.userId, role: invite.role },
      });

      await tx.invite.update({
        where: { tokenHash },
        data: { usedAt: new Date() },
      });

      await tx.auditLog.create({
        data: {
          tenantId: invite.tenantId,
          actorId: params.userId,
          action: "INVITE_ACCEPTED",
          entity: "Invite",
          entityId: invite.id,
          meta: { role: invite.role },
        },
      });
    });

    // Make sure entitlement row exists for older tenants (safety)
    await this.entitlements.getOrCreateEntitlement(invite.tenantId);

    return { tenantId: invite.tenantId, role: invite.role };
  }

  async listAuditLogs(tenantId: string, limit = 50) {
    const logs = await this.prisma.auditLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 200),
      select: {
        id: true,
        createdAt: true,
        actorId: true,
        action: true,
        entity: true,
        entityId: true,
        meta: true,
      },
    });

    return logs;
  }
}
