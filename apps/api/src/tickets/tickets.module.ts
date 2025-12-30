import { Module } from "@nestjs/common";
import { TicketsController } from "./tickets.controller";
import { TicketsService } from "./tickets.service";
import { PrismaModule } from "../prisma/prisma.module";
import { KbModule } from "../kb/kb.module";
import { AiModule } from "../ai/ai.module";
import { EntitlementsModule } from "../entitlements/entitlements.module";
import { TicketAssistService } from "./ticket-assist.service";

@Module({
  imports: [PrismaModule, KbModule, AiModule, EntitlementsModule],
  controllers: [TicketsController],
  providers: [TicketsService, TicketAssistService],
  exports: [TicketsService, TicketAssistService],
})
export class TicketsModule {}
