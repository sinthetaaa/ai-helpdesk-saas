import { Controller, Get, NotFoundException, Param, UseGuards } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuthGuard } from "../common/guards/auth.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { Tenant } from "../common/decorators/tenant.decorator";

@UseGuards(AuthGuard, TenantGuard)
@Controller("jobs")
export class JobsController {
  constructor(private prisma: PrismaService) {}

  @Get(":id")
  async getJob(@Param("id") id: string, @Tenant() tenant: { tenantId: string }) {
    const job = await this.prisma.job.findFirst({
      where: { id, tenantId: tenant.tenantId },
    });

    if (!job) throw new NotFoundException("Job not found");
    return job;
  }
}
