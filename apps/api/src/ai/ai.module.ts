import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "../prisma/prisma.module";
import { EmbeddingService } from "./embedding.service";
import { LlmService } from "./llm.service";
import { FeedbackController } from "./feedback.controller";
import { FeedbackService } from "./feedback.service";

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [FeedbackController],
  providers: [EmbeddingService, LlmService, FeedbackService],
  exports: [EmbeddingService, LlmService],
})
export class AiModule {}
