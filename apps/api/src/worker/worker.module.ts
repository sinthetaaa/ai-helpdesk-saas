import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { PrismaModule } from "../prisma/prisma.module";
import { QueueModule } from "../queues/queue.module";
import { EntitlementsModule } from "../entitlements/entitlements.module";
import { AuthModule } from "../auth/auth.module"; 
import { AiModule } from "../ai/ai.module";
import { KbModule } from "../kb/kb.module";
import { JobsModule } from "../jobs/jobs.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    QueueModule,
    EntitlementsModule,
    AuthModule, 
    AiModule,
    KbModule,
    JobsModule,
  ],
})
export class WorkerModule {}
