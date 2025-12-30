import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { EntitlementsModule } from "../entitlements/entitlements.module";
import { TenantsController } from "./tenants.controller";
import { TenantsService } from "./tenants.service";

@Module({
  imports: [PrismaModule, EntitlementsModule],
  controllers: [TenantsController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
