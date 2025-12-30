import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { Role } from "@prisma/client";

export type RequestTenant = { tenantId: string; role: Role };

export const Tenant = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestTenant => {
  const req = ctx.switchToHttp().getRequest();
  return req.tenant as RequestTenant;
});
