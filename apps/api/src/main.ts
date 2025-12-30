import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { json, urlencoded } from "express";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ["log", "error", "warn"],
  });

  // useful when calling from a frontend + cloudflared
  app.enableCors({
    origin: true,
    credentials: true,
  });

  app.use(json({ limit: "2mb" }));
  app.use(urlencoded({ extended: true, limit: "2mb" }));

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);

  // eslint-disable-next-line no-console
  console.log(`[api] listening on http://localhost:${port}`);
}

bootstrap().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("[api] fatal:", e);
  process.exit(1);
});
