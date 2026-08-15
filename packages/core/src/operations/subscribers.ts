import { Subscriber, SubscriberSchema } from "../schemas.js";

/**
 * Validates and normalizes incoming subscriber data from Telegram webhooks or bot interactions.
 */
export function normalizeSubscriberUpdate(input: {
  telegramChatId: string | number;
  username?: string;
  firstName?: string;
  topics?: string[];
  isActive?: boolean;
}): Subscriber {
  return SubscriberSchema.parse({
    telegramChatId: String(input.telegramChatId),
    username: input.username,
    firstName: input.firstName,
    topics: input.topics || [],
    isActive: input.isActive ?? true,
    joinedAt: new Date().toISOString(),
  });
}
