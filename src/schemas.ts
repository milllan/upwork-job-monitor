import { z } from "zod";
import { getBudgetAmount } from "../utils/utils.js";

// Base schemas for common types
export const CurrencyAmountSchema = z.object({
  amount: z.union([z.number(), z.string()]).transform(val => 
    typeof val === "string" ? parseFloat(val) : val
  ),
  currencyCode: z.string().optional(),
  isoCurrencyCode: z.string().optional(),
});

export const TotalSpentSchema = z.object({
  isoCurrencyCode: z.string().optional(),
  amount: z.union([z.string(), z.number()]).transform(val =>
    typeof val === "string" ? parseFloat(val) : val
  ),
});

export const ClientSchema = z.object({
  paymentVerificationStatus: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  totalReviews: z.number().optional(),
  totalFeedback: z.number().nullable().optional(),
  hasFinancialPrivacy: z.boolean().optional(),
  totalSpent: TotalSpentSchema.nullable().optional(),
});

// Job search response schemas (based on actual API response)
export const JobTileSchema = z.object({
  job: z.object({
    id: z.string().optional(),
    ciphertext: z.string().optional(),
    jobType: z.string().nullable().optional(),
    contractorTier: z.string().nullable().optional(),
    publishTime: z.string().optional(),
    createTime: z.string().optional(),
    totalApplicants: z.number().optional(),
    fixedPriceAmount: z.object({
      isoCurrencyCode: z.string().nullable(),
      amount: z.union([z.number(), z.string()]).transform(val => typeof val === "string" ? parseFloat(val) : val),
    }).nullable().optional(),
    hourlyBudgetMin: z.union([z.number(), z.string()]).transform(val => typeof val === "string" ? parseFloat(val) : val).nullable().optional(),
    hourlyBudgetMax: z.union([z.number(), z.string()]).transform(val => typeof val === "string" ? parseFloat(val) : val).nullable().optional(),
  }),
});

export const UpworkHistoryDataSchema = z.object({
  client: ClientSchema.nullable().optional(),
});

export const JobSearchResultSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  applied: z.boolean().nullable().optional(),
  ontologySkills: z.array(z.object({
    uid: z.string().optional(),
    parentSkillUid: z.unknown().optional(),
    prefLabel: z.string().optional(),
    prettyName: z.string().optional(),
    freeText: z.unknown().optional(),
    highlighted: z.unknown().optional(),
  })).nullable().optional(),
  upworkHistoryData: UpworkHistoryDataSchema.nullable().optional(),
  jobTile: JobTileSchema,
});

export const JobSearchResponseSchema = z.object({
  data: z.object({
    search: z.object({
      universalSearchNuxt: z.object({
        userJobSearchV1: z.object({
          paging: z.object({
            total: z.number(),
            offset: z.number(),
            count: z.number(),
          }),
          results: z.array(JobSearchResultSchema),
        }),
      }),
    }),
  }),
});

// Job details response schemas
export const ClientActivitySchema = z.object({
  lastBuyerActivity: z.string().nullable().transform(val => val || ""),
  totalApplicants: z.number().nullable().transform(val => val || 0),
  totalHired: z.number().nullable().transform(val => val || 0),
  totalInvitedToInterview: z.number().nullable().transform(val => val || 0),
  numberOfPositionsToHire: z.number().optional().nullable(),
});

export const JobOpeningSchema = z.object({
  description: z.string().optional().nullable(),
  clientActivity: ClientActivitySchema.optional().nullable(),
});

export const QuestionSchema = z.object({
  question: z.string().optional().nullable(),
});

export const ClientStatsSchema = z.object({
  totalAssignments: z.number().optional().nullable(),
  hoursCount: z.number().optional().nullable(),
  feedbackCount: z.number().optional().nullable(),
  score: z.number().optional().nullable(),
  totalCharges: z.object({
    amount: z.number().optional().nullable(),
  }).optional().nullable(),
});

export const ClientLocationSchema = z.object({
  city: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
});

export const ClientInfoSchema = z.object({
  location: ClientLocationSchema.optional().nullable(),
  stats: ClientStatsSchema.optional().nullable(),
});

export const JobInfoSchema = z.object({
  title: z.string().optional().nullable(),
});

export const ContractorInfoSchema = z.object({
  contractorName: z.string().optional().nullable(),
  ciphertext: z.string().optional().nullable(),
});

export const FeedbackSchema = z.object({
  score: z.number().optional().nullable(),
  comment: z.string().nullable().optional(),
});

export const WorkHistoryItemSchema = z.object({
  jobInfo: JobInfoSchema.optional().nullable(),
  contractorInfo: ContractorInfoSchema.optional().nullable(),
  feedback: FeedbackSchema.optional().nullable(),
  feedbackToClient: FeedbackSchema.nullable().optional(),
});

export const BuyerSchema = z.object({
  isPaymentMethodVerified: z.boolean().optional().nullable(),
  info: ClientInfoSchema.optional().nullable(),
  workHistory: z.array(WorkHistoryItemSchema).optional().nullable(),
});

export const OpeningSchema = z.object({
  job: JobOpeningSchema.optional().nullable(),
  questions: z.array(QuestionSchema).optional().nullable(),
});

export const ApplicantsBidsStatsSchema = z.object({
  avgRateBid: CurrencyAmountSchema.optional().nullable(),
  minRateBid: CurrencyAmountSchema.optional().nullable(),
  maxRateBid: CurrencyAmountSchema.optional().nullable(),
});

export const JobDetailsSchema = z.object({
  opening: OpeningSchema.optional().nullable(),
  buyer: BuyerSchema.optional().nullable(),
  applicantsBidsStats: ApplicantsBidsStatsSchema.optional().nullable(),
});

export const JobDetailsResponseSchema = z.object({
  data: z.object({
    jobAuthDetails: JobDetailsSchema.optional().nullable(),
  }),
});

// Talent Profile schemas
export const IdentitySchema = z.object({
  uid: z.string(),
  ciphertext: z.string(),
});

export const LocationSchema = z.object({
  country: z.string(),
  city: z.string(),
});

export const SkillNodeSchema = z.object({
  uid: z.string(),
  prettyName: z.string(),
  rank: z.number(),
});

export const ProfileSkillSchema = z.object({
  node: SkillNodeSchema,
});

export const ProfileSchema = z.object({
  name: z.string(),
  title: z.string(),
  description: z.string(),
  location: LocationSchema,
  skills: z.array(ProfileSkillSchema),
  contractorTier: z.number(),
});

export const HourlyRateNodeSchema = z.object({
  currencyCode: z.string(),
  amount: z.number(),
});

export const HourlyRateSchema = z.object({
  node: HourlyRateNodeSchema,
});

export const StatsSchema = z.object({
  totalHours: z.number(),
  totalJobsWorked: z.number(),
  rating: z.number(),
  hourlyRate: HourlyRateSchema,
  memberSince: z.string(),
  hireAgainPercentage: z.number(),
  topRatedStatus: z.string(),
  totalEarnings: z.number(),
});

export const TalentProfileSchema = z.object({
  identity: IdentitySchema,
  profile: ProfileSchema,
  stats: StatsSchema,
});

export const TalentProfileResponseSchema = z.object({
  data: z.object({
    talentVPDAuthProfile: TalentProfileSchema,
  }),
});

// Utility functions for safe parsing
export function safeParseJobSearchResponse(data: unknown) {
  return JobSearchResponseSchema.safeParse(data);
}

export function safeParseJobDetailsResponse(data: unknown) {
  return JobDetailsResponseSchema.safeParse(data);
}

export function safeParseTalentProfileResponse(data: unknown) {
  return TalentProfileResponseSchema.safeParse(data);
}

// Transforming schemas for internal application use
const getBudgetAmount = (
  t: z.infer<typeof JobSearchResultSchema>,
  isMin: boolean,
): number => {
  const { jobType, hourlyBudgetMin, hourlyBudgetMax, fixedPriceAmount } = t.jobTile.job;
  if (jobType === 'Hourly') {
    return isMin ? hourlyBudgetMin || 0 : hourlyBudgetMax || 0;
  }
  return fixedPriceAmount?.amount || 0;
};

export const CleanJobSchema = JobSearchResultSchema.transform((job) => {
  return {
    id: job.jobTile.job.ciphertext || job.jobTile.job.id,
    ciphertext: job.jobTile.job.ciphertext,
    title: job.title,
    description: job.description,
    postedOn: job.jobTile.job.publishTime || job.jobTile.job.createTime,
    applied: job.applied,
    budget: {
      type: job.jobTile.job.jobType,
      currencyCode: job.jobTile.job.fixedPriceAmount?.isoCurrencyCode || 'USD',
      minAmount: getBudgetAmount(job, true),
      maxAmount: getBudgetAmount(job, false),
    },
    client: {
      paymentVerificationStatus: job.upworkHistoryData?.client?.paymentVerificationStatus || 'N/A',
      country: job.upworkHistoryData?.client?.country || 'N/A',
      totalSpent: job.upworkHistoryData?.client?.totalSpent?.amount || 0,
      rating: job.upworkHistoryData?.client?.totalFeedback || null,
    },
    skills:
      job.ontologySkills?.map((skill) => ({ name: skill.prettyName ?? skill.prefLabel ?? '' })) ?? [],
    _fullJobData: job as unknown as Record<string, unknown>,
  };
});

export const CleanJobDetailsSchema = JobDetailsSchema;

export const CleanTalentProfileSchema = TalentProfileSchema.transform((profile) => {
  return {
    ...profile,
  };
});

// Type exports for use in other files
export type Job = z.infer<typeof CleanJobSchema>;
export type JobSearchResponse = z.infer<typeof JobSearchResponseSchema>;
export type JobSearchResult = z.infer<typeof JobSearchResultSchema>;
export type JobDetailsResponse = z.infer<typeof JobDetailsResponseSchema>;
export type JobDetails = z.infer<typeof CleanJobDetailsSchema>;
export type TalentProfileResponse = z.infer<typeof TalentProfileResponseSchema>;
export type TalentProfile = z.infer<typeof CleanTalentProfileSchema>;
