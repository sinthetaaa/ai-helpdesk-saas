import { Module } from "@nestjs/common";
import { UsageController } from "./usage.controller";
import { UsageService } from "./usage.service";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [UsageController],
  providers: [UsageService],
  exports: [UsageService],
})
export class UsageModule {}
