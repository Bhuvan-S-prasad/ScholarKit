export interface SchedulableItem {
  id?: string;
  status: string;
  scheduledAt?: string | Date | null;
}

/**
 * Pure evaluation function to check if a scheduled item is due for delivery.
 */
export function isDueForDelivery(
  item: SchedulableItem,
  now: Date = new Date()
): boolean {
  if (item.status !== "scheduled" || !item.scheduledAt) {
    return false;
  }
  const scheduledTime = new Date(item.scheduledAt).getTime();
  return !isNaN(scheduledTime) && scheduledTime <= now.getTime();
}

/**
 * Pure evaluation function to partition items into due and upcoming queues.
 */
export function evaluateScheduledQueue<T extends SchedulableItem>(
  items: T[],
  now: Date = new Date()
): { due: T[]; upcoming: T[] } {
  const due: T[] = [];
  const upcoming: T[] = [];

  for (const item of items) {
    if (isDueForDelivery(item, now)) {
      due.push(item);
    } else if (item.status === "scheduled") {
      upcoming.push(item);
    }
  }

  return { due, upcoming };
}
