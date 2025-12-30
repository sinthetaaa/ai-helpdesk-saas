import { Module } from "@nestjs/common";
import { KbController } from "./kb.controller";
import { KbService } from "./kb.service";
import { KbIndexingService } from "./kb.indexing.service";
import { KbStorageService } from "./kb.storage.service";
import { AiModule } from "../ai/ai.module";
import { PrismaModule } from "../prisma/prisma.module";
import { QueueModule } from "../queues/queue.module";
import { EntitlementsModule } from "../entitlements/entitlements.module";

@Module({
  imports: [AiModule, PrismaModule, QueueModule, EntitlementsModule],
  controllers: [KbController],
  providers: [KbService, KbIndexingService, KbStorageService],
  exports: [KbService, KbIndexingService, KbStorageService],
})
export class KbModule {}
