import { Redis } from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://dragonfly.databases:6379";
const KEY_PREFIX = "espen-slack-bot:thread:";
const TTL_SECONDS = 60 * 60 * 24; // 24 hours

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(REDIS_URL, { lazyConnect: true });
    redis.connect().catch((err: unknown) => {
      console.error("Redis connection error:", err);
      redis = null;
    });
  }
  return redis;
}

export async function getConversationId(
  threadTs: string
): Promise<string | undefined> {
  try {
    const value = await getRedis().get(`${KEY_PREFIX}${threadTs}`);
    return value ?? undefined;
  } catch {
    return undefined;
  }
}

export async function setConversationId(
  threadTs: string,
  conversationId: string
): Promise<void> {
  try {
    await getRedis().set(
      `${KEY_PREFIX}${threadTs}`,
      conversationId,
      "EX",
      TTL_SECONDS
    );
  } catch {
    // Non-fatal — conversation continuity degrades gracefully
  }
}
