import { NestFactory } from "@nestjs/core";
import { WorkerModule } from "./worker.module";

async function bootstrap() {
  await NestFactory.createApplicationContext(WorkerModule, {
    logger: ["log", "error", "warn"],
  });

  // eslint-disable-next-line no-console
  console.log("[worker] started");
}

bootstrap().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("[worker] fatal:", e);
  process.exit(1);
});
