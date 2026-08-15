import { DeliveryLog, DeliveryLogSchema } from "../schemas.js";

/**
 * Creates a validated delivery log entry.
 */
export function createDeliveryLog(
  newsletterId: string,
  telegramChatId: string,
  status: "pending" | "sent" | "failed",
  options?: { subscriberId?: string; errorMessage?: string }
): DeliveryLog {
  return DeliveryLogSchema.parse({
    newsletterId,
    telegramChatId,
    status,
    subscriberId: options?.subscriberId,
    errorMessage: options?.errorMessage,
    sentAt: new Date().toISOString(),
  });
}
