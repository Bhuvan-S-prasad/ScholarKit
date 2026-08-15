import { z } from "zod";

// ============================================================================
// 1. Domain Enums
// ============================================================================

export const PaperSourceSchema = z.enum(["arxiv", "doi", "pdf_upload", "url"]);
export type PaperSource = z.infer<typeof PaperSourceSchema>;

export const PaperStatusSchema = z.enum([
  "ingested",
  "extracting",
  "extracted",
  "analyzed",
  "archived",
]);
export type PaperStatus = z.infer<typeof PaperStatusSchema>;

export const ContentTypeSchema = z.enum([
  "paper_note",
  "literature_review",
  "newsletter",
  "digest",
]);
export type ContentType = z.infer<typeof ContentTypeSchema>;

export const ReviewStatusSchema = z.enum([
  "draft",
  "in_review",
  "changes_requested",
  "approved",
  "scheduled",
  "sending",
  "sent",
  "failed",
]);
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

export const DeliveryTargetSchema = z.enum([
  "telegram_dm",
  "telegram_channel",
  "telegram_group",
]);
export type DeliveryTarget = z.infer<typeof DeliveryTargetSchema>;

// ============================================================================
// 2. Paper Metadata & Extraction Schemas
// ============================================================================

export const PaperMetadataSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1, "Title cannot be empty"),
  authors: z.array(z.string()).min(1, "At least one author is required"),
  abstract: z.string().min(1, "Abstract cannot be empty"),
  publishedDate: z.string(), // ISO 8601 or YYYY-MM-DD
  source: PaperSourceSchema,
  sourceId: z.string().min(1, "Source identifier (arXiv ID, DOI, URL) is required"),
  url: z.string().url("Invalid paper URL"),
  pdfUrl: z.string().url("Invalid PDF URL").optional(),
  categories: z.array(z.string()).default([]),
  status: PaperStatusSchema.default("ingested"),
  rawContent: z.string().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});
export type PaperMetadata = z.infer<typeof PaperMetadataSchema>;

export const PaperMethodologySchema = z.object({
  approach: z.string().min(1, "Methodological approach is required"),
  datasetInfo: z.string().optional(),
  toolsOrFrameworks: z.array(z.string()).default([]),
  experimentalSetup: z.string().optional(),
});
export type PaperMethodology = z.infer<typeof PaperMethodologySchema>;

export const PaperExtractionSchema = z.object({
  paperId: z.string().optional(),
  methodology: PaperMethodologySchema,
  keyFindings: z.array(z.string()).min(1, "At least one key finding is required"),
  contributions: z.array(z.string()).min(1, "At least one contribution is required"),
  limitations: z.array(z.string()).min(1, "At least one limitation is required"),
  confidence: z
    .number()
    .min(0, "Confidence must be >= 0")
    .max(1, "Confidence must be <= 1"),
  extractionNotes: z.string().optional(),
  extractedAt: z.string().datetime().optional(),
});
export type PaperExtraction = z.infer<typeof PaperExtractionSchema>;

export const ComparisonMetricSchema = z.object({
  topic: z.string(),
  findingsByPaper: z.record(z.string(), z.string()), // paperId/sourceId -> finding summary
  synthesis: z.string(),
});
export type ComparisonMetric = z.infer<typeof ComparisonMetricSchema>;

export const PaperAnalysisSchema = z.object({
  paperIds: z.array(z.string()).min(2, "Comparison requires at least two papers"),
  comparisonMatrix: z.array(ComparisonMetricSchema),
  commonLimitations: z.array(z.string()),
  researchGaps: z.array(z.string()),
  practicalImplications: z.array(z.string()),
  generatedAt: z.string().datetime().optional(),
});
export type PaperAnalysis = z.infer<typeof PaperAnalysisSchema>;

// ============================================================================
// 3. Literature Review Schemas
// ============================================================================

export const LitReviewProjectSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1, "Project title is required"),
  description: z.string().optional(),
  query: z.string().min(1, "Search query is required"),
  inclusionCriteria: z.array(z.string()).default([]),
  exclusionCriteria: z.array(z.string()).default([]),
  status: z.enum(["active", "completed", "archived"]).default("active"),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});
export type LitReviewProject = z.infer<typeof LitReviewProjectSchema>;

export const LitClassificationSchema = z.enum([
  "highly_relevant",
  "relevant",
  "background",
  "irrelevant",
]);
export type LitClassification = z.infer<typeof LitClassificationSchema>;

export const LitReviewEntrySchema = z.object({
  id: z.string().optional(),
  projectId: z.string(),
  paperId: z.string(),
  relevanceScore: z.number().min(0).max(1),
  classification: LitClassificationSchema,
  reasonForScore: z.string(),
  notes: z.string().optional(),
  createdAt: z.string().datetime().optional(),
});
export type LitReviewEntry = z.infer<typeof LitReviewEntrySchema>;

export const LitReviewSectionSchema = z.object({
  title: z.string(),
  content: z.string(),
  citedPaperIds: z.array(z.string()),
});
export type LitReviewSection = z.infer<typeof LitReviewSectionSchema>;

export const LiteratureReviewDraftSchema = z.object({
  title: z.string(),
  abstractOrExecutiveSummary: z.string(),
  sections: z.array(LitReviewSectionSchema),
  researchGapsIdentified: z.array(z.string()),
  conclusion: z.string(),
  generatedAt: z.string().datetime().optional(),
});
export type LiteratureReviewDraft = z.infer<typeof LiteratureReviewDraftSchema>;

// ============================================================================
// 4. Newsletter & Workflow Schemas
// ============================================================================

export const WorkflowActionSchema = z.enum([
  "submit_for_review",
  "request_changes",
  "approve",
  "schedule",
  "start_sending",
  "mark_sent",
  "mark_failed",
  "retry",
]);
export type WorkflowAction = z.infer<typeof WorkflowActionSchema>;

export const NewsletterSectionSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1, "Section title is required"),
  content: z.string().min(1, "Section content is required"),
  order: z.number().int().nonnegative(),
  paperReferences: z.array(z.string()).default([]),
  sectionType: z
    .enum(["intro", "deep_dive", "quick_takes", "outro", "custom"])
    .default("custom"),
});
export type NewsletterSection = z.infer<typeof NewsletterSectionSchema>;

export const NewsletterSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1, "Newsletter title is required"),
  issueNumber: z.number().int().positive().optional(),
  contentType: ContentTypeSchema.default("newsletter"),
  status: ReviewStatusSchema.default("draft"),
  sections: z.array(NewsletterSectionSchema).default([]),
  scheduledAt: z.string().datetime().nullable().optional(),
  sentAt: z.string().datetime().nullable().optional(),
  target: DeliveryTargetSchema.default("telegram_channel"),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});
export type Newsletter = z.infer<typeof NewsletterSchema>;

export const PersonalizedDigestSchema = z.object({
  subscriberId: z.string(),
  newsletterId: z.string(),
  personalizedContent: z.string(),
  target: DeliveryTargetSchema,
});
export type PersonalizedDigest = z.infer<typeof PersonalizedDigestSchema>;

// ============================================================================
// 5. Subscriber & Delivery Schemas
// ============================================================================

export const SubscriberSchema = z.object({
  id: z.string().optional(),
  telegramChatId: z.string().min(1, "Telegram Chat ID is required"),
  username: z.string().optional(),
  firstName: z.string().optional(),
  isActive: z.boolean().default(true),
  topics: z.array(z.string()).default([]),
  joinedAt: z.string().datetime().optional(),
});
export type Subscriber = z.infer<typeof SubscriberSchema>;

export const DeliveryLogSchema = z.object({
  id: z.string().optional(),
  newsletterId: z.string(),
  subscriberId: z.string().optional(),
  telegramChatId: z.string(),
  status: z.enum(["pending", "sent", "failed"]),
  errorMessage: z.string().optional(),
  sentAt: z.string().datetime().optional(),
});
export type DeliveryLog = z.infer<typeof DeliveryLogSchema>;

export const TelegramMessageChunkSchema = z.object({
  chatId: z.string(),
  text: z.string().max(4096, "Telegram message length cannot exceed 4096 characters"),
  parseMode: z.enum(["HTML", "MarkdownV2"]).default("HTML"),
  chunkIndex: z.number().int().nonnegative(),
  totalChunks: z.number().int().positive(),
});
export type TelegramMessageChunk = z.infer<typeof TelegramMessageChunkSchema>;
