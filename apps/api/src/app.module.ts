import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { join } from "path";

import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { TenantsModule } from "./tenants/tenants.module";
import { TicketsModule } from "./tickets/tickets.module";
import { AiModule } from "./ai/ai.module";
import { KbModule } from "./kb/kb.module";
import { UsageModule } from "./usage/usage.module";
import { EntitlementsModule } from "./entitlements/entitlements.module";
import { JobsModule } from "./jobs/jobs.module";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(process.cwd(), ".env"),
    }),
    PrismaModule,
    AuthModule,
    TenantsModule,
    TicketsModule,
    AiModule,
    KbModule,
    UsageModule,
    EntitlementsModule,
    JobsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
