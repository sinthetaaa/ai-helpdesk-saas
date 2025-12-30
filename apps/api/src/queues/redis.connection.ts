import IORedis from "ioredis";

function isTlsRedisUrl(url: string) {
  // rediss:// indicates TLS
  return url.startsWith("rediss://");
}

export function makeRedisConnection(redisUrl: string) {
  return new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    ...(isTlsRedisUrl(redisUrl)
      ? {
          tls: {
            // NOTE: for managed redis providers this is usually fine.
            // If you run into certificate issues, you can set:
            // rejectUnauthorized: false
          },
        }
      : {}),
  });
}
