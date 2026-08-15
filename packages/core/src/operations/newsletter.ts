import {
  Newsletter,
  NewsletterSchema,
  NewsletterSection,
  Subscriber,
  PersonalizedDigest,
  PersonalizedDigestSchema,
} from "../schemas.js";

/**
 * Creates a validated Newsletter draft from title and sections.
 */
export function createNewsletterDraft(
  title: string,
  sections: NewsletterSection[],
  options?: { issueNumber?: number; target?: Newsletter["target"] }
): Newsletter {
  return NewsletterSchema.parse({
    title,
    issueNumber: options?.issueNumber,
    status: "draft",
    target: options?.target || "telegram_channel",
    sections: sections.sort((a, b) => a.order - b.order),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Personalizes newsletter content for a specific subscriber based on their interests.
 */
export function personalizeNewsletterForSubscriber(
  newsletter: Newsletter,
  subscriber: Subscriber
): PersonalizedDigest {
  const greeting = subscriber.firstName
    ? `Hey ${subscriber.firstName}, here is your tailored research digest:`
    : `Here is your research digest:`;

  // If subscriber has specific topics, prioritize matching sections
  let filteredSections = newsletter.sections;
  if (subscriber.topics && subscriber.topics.length > 0) {
    const topicSet = new Set(subscriber.topics.map((t) => t.toLowerCase()));
    const relevant = newsletter.sections.filter((s) =>
      topicSet.has(s.title.toLowerCase()) ||
      topicSet.has(s.sectionType.toLowerCase()) ||
      s.sectionType === "intro" ||
      s.sectionType === "outro"
    );
    if (relevant.length > 0) {
      filteredSections = relevant;
    }
  }

  const formattedSections = filteredSections
    .map((s) => `### ${s.title}\n\n${s.content}`)
    .join("\n\n---\n\n");

  const fullContent = `${greeting}\n\n# ${newsletter.title}\n\n${formattedSections}`;

  return PersonalizedDigestSchema.parse({
    subscriberId: subscriber.id || subscriber.telegramChatId,
    newsletterId: newsletter.id || "current-newsletter",
    personalizedContent: fullContent,
    target: "telegram_dm",
  });
}
