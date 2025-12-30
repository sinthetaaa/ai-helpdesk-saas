import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Role } from "@prisma/client";
import { z } from "zod";
import { createHash, randomBytes } from "crypto";

import { AuthGuard } from "../common/guards/auth.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { Tenant } from "../common/decorators/tenant.decorator";
import { User } from "../common/decorators/user.decorator";

import { PrismaService } from "../prisma/prisma.service";
import { TenantsService } from "./tenants.service";

const CreateTenantDto = z.object({
  name: z.string().min(2).max(80),
});

const CreateInviteDto = z.object({
  email: z.string().email().optional(),
  role: z.enum(["OWNER", "ADMIN", "AGENT", "VIEWER"]),
  ttlHours: z.number().int().min(1).max(24 * 14).optional(),
});

const AcceptInviteDto = z.object({
  token: z.string().min(10).max(500),
});

const AuditQueryDto = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const ListInvitesQueryDto = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const ReissueInviteDto = z.object({
  ttlHours: z.number().int().min(1).max(24 * 14).optional(),
});

@Controller("tenants")
@UseGuards(AuthGuard)
export class TenantsController {
  constructor(
    private tenants: TenantsService,
    private prisma: PrismaService,
  ) {}

  @Post()
  async create(@Req() req: any, @Body() body: unknown) {
    const parsed = CreateTenantDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    return this.tenants.createTenant(req.user.userId, parsed.data.name);
  }

  // NOTE: this returns the LIST of my tenants (used by TenantSwitcher)
  @Get("me")
  async myTenants(@Req() req: any) {
    return this.tenants.listMyTenants(req.user.userId);
  }

  // current tenant context (used by Settings "Current tenant" card)
  @UseGuards(TenantGuard)
  @Get("current")
  async currentTenant(@Tenant() tenant: { tenantId: string }, @User() user: { userId: string }) {
    const [t, m] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: tenant.tenantId },
        select: { id: true, name: true },
      }),
      this.prisma.membership.findFirst({
        where: { tenantId: tenant.tenantId, userId: user.userId },
        select: { role: true },
      }),
    ]);

    return {
      tenantId: tenant.tenantId,
      name: t?.name ?? null,
      role: m?.role ?? null,
      userId: user.userId,
    };
  }

  @UseGuards(TenantGuard)
  @Get("members")
  async listMembers(@Tenant() tenant: { tenantId: string }) {
    return this.tenants.listMembers(tenant.tenantId);
  }

  // ---- INVITES ----

  @UseGuards(TenantGuard, RolesGuard)
  @Roles("OWNER", "ADMIN")
  @Post("invites")
  async createInvite(
    @Tenant() tenant: { tenantId: string },
    @User() user: { userId: string },
    @Body() body: unknown,
  ) {
    const parsed = CreateInviteDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    // Enforce membership limit (entitlements)
    // (Your Usage page shows "Members" vs entitlement.maxAgents, so we apply the same limit here.)
    const entitlement = await this.prisma.entitlement.upsert({
      where: { tenantId: tenant.tenantId },
      update: {},
      create: { tenantId: tenant.tenantId },
    });

    const membersCount = await this.prisma.membership.count({
      where: { tenantId: tenant.tenantId },
    });

    if (entitlement.maxAgents > 0 && membersCount >= entitlement.maxAgents) {
      throw new BadRequestException(
        `Member limit reached (${membersCount}/${entitlement.maxAgents}). Remove a member or upgrade your plan.`,
      );
    }

    return this.tenants.createInvite({
      tenantId: tenant.tenantId,
      createdBy: user.userId,
      email: parsed.data.email,
      role: parsed.data.role as Role,
      ttlHours: parsed.data.ttlHours,
    });
  }

  // list pending invites
  @UseGuards(TenantGuard, RolesGuard)
  @Roles("OWNER", "ADMIN")
  @Get("invites")
  async listInvites(@Tenant() tenant: { tenantId: string }, @Query() query: unknown) {
    const parsed = ListInvitesQueryDto.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const limit = parsed.data.limit ?? 50;
    const now = new Date();

    const items = await this.prisma.invite.findMany({
      where: {
        tenantId: tenant.tenantId,
        usedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        createdAt: true,
        createdBy: true,
        usedAt: true,
      },
    });

    return { items };
  }

  // revoke invite
  @UseGuards(TenantGuard, RolesGuard)
  @Roles("OWNER", "ADMIN")
  @Delete("invites/:id")
  async revokeInvite(@Tenant() tenant: { tenantId: string }, @Param("id") id: string) {
    const inv = await this.prisma.invite.findFirst({
      where: { id, tenantId: tenant.tenantId },
      select: { id: true, usedAt: true },
    });
    if (!inv) throw new BadRequestException("Invite not found");
    if (inv.usedAt) throw new BadRequestException("Invite already used");

    await this.prisma.invite.delete({ where: { id } });
    return { ok: true };
  }

  // reissue invite token so UI can "Copy link" anytime (rotates tokenHash)
  @UseGuards(TenantGuard, RolesGuard)
  @Roles("OWNER", "ADMIN")
  @Post("invites/:id/reissue")
  async reissueInvite(
    @Tenant() tenant: { tenantId: string },
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const parsed = ReissueInviteDto.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const inv = await this.prisma.invite.findFirst({
      where: { id, tenantId: tenant.tenantId },
      select: { id: true, usedAt: true },
    });
    if (!inv) throw new BadRequestException("Invite not found");
    if (inv.usedAt) throw new BadRequestException("Invite already used");

    const ttlHours = parsed.data.ttlHours ?? 24 * 7;

    // retry a couple times for extremely unlikely tokenHash collision
    for (let attempt = 0; attempt < 3; attempt++) {
      const token = randomBytes(24).toString("hex");
      const tokenHash = createHash("sha256").update(token).digest("hex");
      try {
        await this.prisma.invite.update({
          where: { id },
          data: {
            tokenHash,
            usedAt: null,
            expiresAt: new Date(Date.now() + ttlHours * 60 * 60 * 1000),
          },
        });
        return { token };
      } catch (e: any) {
        if (attempt === 2) throw e;
      }
    }

    throw new BadRequestException("Failed to reissue invite");
  }

  // this endpoint uses @User(), so it must be protected by AuthGuard
  @Post("invites/accept")
  async acceptInvite(@User() user: { userId: string }, @Body() body: unknown) {
    const parsed = AcceptInviteDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    return this.tenants.acceptInvite({
      userId: user.userId,
      token: parsed.data.token,
    });
  }

  // ---- AUDIT ----

  @UseGuards(TenantGuard, RolesGuard)
  @Roles("OWNER", "ADMIN")
  @Get("audit")
  async audit(@Tenant() tenant: { tenantId: string }, @Query() query: unknown) {
    const parsed = AuditQueryDto.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    return this.tenants.listAuditLogs(tenant.tenantId, parsed.data.limit ?? 50);
  }
}
