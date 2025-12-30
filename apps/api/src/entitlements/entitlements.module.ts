import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { EntitlementsService } from "./entitlements.service";

@Module({
  imports: [PrismaModule],
  providers: [EntitlementsService],
  exports: [EntitlementsService],
})
export class EntitlementsModule {}
