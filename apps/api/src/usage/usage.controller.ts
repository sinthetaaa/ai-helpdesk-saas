import { BadRequestException, Controller, Get, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";

import { AuthGuard } from "../common/guards/auth.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { Tenant } from "../common/decorators/tenant.decorator";

import { UsageService } from "./usage.service";

const SummaryQuery = z.object({
  // optional: "2025-12"
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

@Controller("usage")
@UseGuards(AuthGuard, TenantGuard)
export class UsageController {
  constructor(private usage: UsageService) {}

  @Get("summary")
  async summary(@Tenant() tenant: { tenantId: string }, @Query() query: unknown) {
    const parsed = SummaryQuery.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    return this.usage.getSummary(tenant.tenantId, parsed.data.month);
  }
}
