import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Role } from "@prisma/client";
import { ROLES_KEY } from "../decorators/roles.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest();
    const role: Role | undefined = req.tenant?.role;

    if (!role) throw new ForbiddenException("Missing tenant context");
    if (!required.includes(role)) throw new ForbiddenException("Insufficient role");

    return true;
  }
}
