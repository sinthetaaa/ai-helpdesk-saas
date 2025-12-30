import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { JobsController } from "./jobs.controller";

@Module({
  imports: [PrismaModule],
  controllers: [JobsController],
})
export class JobsModule {}
