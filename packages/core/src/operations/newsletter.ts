import {
  Newsletter,
  NewsletterSchema,
  NewsletterSection,
  PaperMetadata,
  LitReviewProject,
  LiteratureReviewDraft,
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
 * Creates a structured Newsletter draft directly from a synthesized Literature Review project.
 */
export function createNewsletterFromLiteratureReview(
  project: LitReviewProject,
  draft: LiteratureReviewDraft,
  topPapers: PaperMetadata[] = [],
  options?: { issueNumber?: number; target?: Newsletter["target"] }
): Newsletter {
  const sections: NewsletterSection[] = [];
  let order = 1;

  // 1. Intro Section
  sections.push({
    title: "Executive Synthesis & Thematic Overview",
    sectionType: "intro",
    content: draft.abstractOrExecutiveSummary || `Comprehensive literature synthesis on "${project.title}".`,
    order: order++,
    paperReferences: topPapers.map((p) => p.sourceId),
  });

  // 2. Thematic Deep Dives
  for (const sec of draft.sections) {
    sections.push({
      title: sec.title,
      sectionType: "deep_dive",
      content: sec.content,
      order: order++,
      paperReferences: sec.citedPaperIds || [],
    });
  }

  // 3. Research Gaps Section
  if (draft.researchGapsIdentified && draft.researchGapsIdentified.length > 0) {
    const gapsContent = draft.researchGapsIdentified.map((g) => `• ${g}`).join("\n");
    sections.push({
      title: "Research Gaps & Future Directions",
      sectionType: "quick_takes",
      content: `The following open challenges were identified across surveyed works:\n\n${gapsContent}`,
      order: order++,
      paperReferences: [],
    });
  }

  // 4. Outro Section
  sections.push({
    title: "Key Takeaways & Conclusion",
    sectionType: "outro",
    content: draft.conclusion || "Stay subscribed for continuous intelligence on emerging research literature.",
    order: order++,
    paperReferences: [],
  });

  return createNewsletterDraft(
    `ScholarKit Research Digest: ${project.title}`,
    sections,
    { issueNumber: options?.issueNumber, target: options?.target }
  );
}

/**
 * Creates a structured Newsletter digest roundup from a list of recently ingested papers.
 */
export function createNewsletterFromRecentPapers(
  papers: PaperMetadata[],
  options?: { issueNumber?: number; title?: string; target?: Newsletter["target"] }
): Newsletter {
  const sections: NewsletterSection[] = [];
  let order = 1;

  // 1. Intro Section
  sections.push({
    title: "Research Roundup Overview",
    sectionType: "intro",
    content: `Welcome to this edition of the ScholarKit Research Digest. Today we review ${papers.length} recently published research papers across machine learning and computing.`,
    order: order++,
    paperReferences: papers.map((p) => p.sourceId),
  });

  // 2. Paper Summaries
  for (const paper of papers) {
    const authors = paper.authors.slice(0, 3).join(", ") + (paper.authors.length > 3 ? " et al." : "");
    const content = `**Authors**: ${authors}\n**Published**: ${paper.publishedDate}\n**arXiv**: [${paper.sourceId}](${paper.url})\n\n${paper.abstract}`;

    sections.push({
      title: paper.title,
      sectionType: "deep_dive",
      content,
      order: order++,
      paperReferences: [paper.sourceId],
    });
  }

  // 3. Outro Section
  sections.push({
    title: "Wrap-up & Community",
    sectionType: "outro",
    content: "Subscribe to stay ahead of fast-moving machine learning and systems research. Have feedback or papers to recommend? Let us know!",
    order: order++,
    paperReferences: [],
  });

  const title = options?.title || `ScholarKit Weekly Digest: ${papers[0]?.title.slice(0, 30) || "Recent Ingests"}...`;

  return createNewsletterDraft(title, sections, {
    issueNumber: options?.issueNumber,
    target: options?.target,
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
