import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

function getHeader(req: any, name: string): string | null {
  const v = req?.headers?.[name];
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return null;
}

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();

    const userId: string | undefined = req.user?.userId;
    if (!userId) throw new ForbiddenException("Missing authenticated user");

    const tenantIdRaw = getHeader(req, "x-tenant-id");
    const tenantId = tenantIdRaw?.trim() ? tenantIdRaw.trim() : null;

    if (!tenantId) throw new ForbiddenException("Missing X-Tenant-Id header");

    const membership = await this.prisma.membership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { role: true },
    });

    if (!membership) throw new ForbiddenException("Not a member of this tenant");

    req.tenant = { tenantId, role: membership.role };
    return true;
  }
}
