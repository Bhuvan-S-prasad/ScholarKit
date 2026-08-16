import {
  Briefing,
  BriefingSchema,
  BriefingSection,
  PaperMetadata,
  LitReviewProject,
  LiteratureReviewDraft,
  Subscriber,
  PersonalizedDigest,
  PersonalizedDigestSchema,
} from "../schemas.js";

/**
 * Creates a validated Research Briefing draft from title and sections.
 */
export function createBriefingDraft(
  title: string,
  sections: BriefingSection[],
  options?: { issueNumber?: number; target?: Briefing["target"] }
): Briefing {
  return BriefingSchema.parse({
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
 * Creates a structured Research Briefing draft directly from a synthesized Literature Review project.
 */
export function createBriefingFromLiteratureReview(
  project: LitReviewProject,
  draft: LiteratureReviewDraft,
  topPapers: PaperMetadata[] = [],
  options?: { issueNumber?: number; target?: Briefing["target"] }
): Briefing {
  const sections: BriefingSection[] = [];
  let order = 1;

  // 1. Intro Section
  sections.push({
    title: "Executive Synthesis & Thematic Overview",
    sectionType: "intro",
    content: draft.abstractOrExecutiveSummary || `Comprehensive research briefing and literature synthesis on "${project.title}".`,
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
    content: draft.conclusion || "Stay subscribed for continuous research intelligence on emerging scientific literature.",
    order: order++,
    paperReferences: [],
  });

  return createBriefingDraft(
    `ScholarKit Research Briefing: ${project.title}`,
    sections,
    { issueNumber: options?.issueNumber, target: options?.target }
  );
}

/**
 * Creates a structured Research Briefing roundup from recently ingested papers.
 */
export function createBriefingFromRecentPapers(
  papers: PaperMetadata[],
  options?: { issueNumber?: number; title?: string; target?: Briefing["target"] }
): Briefing {
  const sections: BriefingSection[] = [];
  let order = 1;

  // 1. Intro Section
  sections.push({
    title: "Research Briefing Overview",
    sectionType: "intro",
    content: `Welcome to this edition of the ScholarKit Research Briefing. Today we review ${papers.length} recently published research papers across machine learning and computing.`,
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
    title: "Wrap-up & Intelligence Insights",
    sectionType: "outro",
    content: "Subscribe to stay ahead of fast-moving machine learning and systems research. Have feedback or papers to recommend? Let us know!",
    order: order++,
    paperReferences: [],
  });

  const title = options?.title || `ScholarKit Research Briefing: ${papers[0]?.title.slice(0, 30) || "Recent Ingests"}...`;

  return createBriefingDraft(title, sections, {
    issueNumber: options?.issueNumber,
    target: options?.target,
  });
}

/**
 * Personalizes briefing content for a specific subscriber based on their interests.
 */
export function personalizeBriefingForSubscriber(
  briefing: Briefing,
  subscriber: Subscriber
): PersonalizedDigest {
  const greeting = subscriber.firstName
    ? `Hey ${subscriber.firstName}, here is your tailored research briefing:`
    : `Here is your tailored research briefing:`;

  let filteredSections = briefing.sections;
  if (subscriber.topics && subscriber.topics.length > 0) {
    const topicSet = new Set(subscriber.topics.map((t) => t.toLowerCase()));
    const relevant = briefing.sections.filter((s) =>
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

  const fullContent = `${greeting}\n\n# ${briefing.title}\n\n${formattedSections}`;

  return PersonalizedDigestSchema.parse({
    subscriberId: subscriber.id || subscriber.telegramChatId,
    briefingId: briefing.id || "current-briefing",
    newsletterId: briefing.id || "current-briefing",
    personalizedContent: fullContent,
    target: "telegram_dm",
  });
}
