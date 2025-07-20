
export type Tier = 'EntryLevel' | 'IntermediateLevel' | 'ExpertLevel';

export interface Job {
    id: string;
    ciphertext: string;
    title: string;
    description: string;
    postedOn: string;
    applied: boolean;
    budget: {
        type: string;
        currencyCode: string;
        minAmount: number;
        maxAmount: number;
    };
    client: {
        paymentVerificationStatus: string;
        country: string;
        totalSpent: number;
        rating: number | null;
    };
    skills: { name: string }[];
    _fullJobData: Record<string, unknown>;
    isExcludedByTitleFilter?: boolean;
    isLowPriorityBySkill?: boolean;
    isLowPriorityByClientCountry?: boolean;
}

export interface ProcessedJob extends Job {
  isExcludedByTitleFilter: boolean;
  isLowPriorityBySkill: boolean;
  isLowPriorityByClientCountry: boolean;
}

export interface JobDetails {
    opening: {
        job: {
            description: string;
            clientActivity: {
                lastBuyerActivity: string;
                totalApplicants: number;
                totalHired: number;
                totalInvitedToInterview: number;
                numberOfPositionsToHire: number;
            };
        };
        questions: {
            question: string;
        }[];
    };
    buyer: {
        info: {
            stats: {
                totalAssignments: number;
                hoursCount: number;
                feedbackCount: number;
                score: number;
                totalCharges: {
                    amount: number;
                };
            };
        };
        workHistory: {
            contractorInfo: {
                contractorName: string;
                ciphertext: string;
            };
        }[];
    };
    applicantsBidsStats: {
        avgRateBid: {
            amount: number;
        };
        minRateBid: {
            amount: number;
        };
        maxRateBid: {
            amount: number;
        };
    };
}

export interface TalentProfile {
    identity: {
        uid: string;
        ciphertext: string;
    };
    profile: {
        name: string;
        title: string;
        description: string;
        location: {
            country: string;
            city: string;
        };
        skills: {
            node: {
                prettyName: string;
                rank: number;
            };
        }[];
    };
    stats: {
        totalHours: number;
        totalJobsWorked: number;
        rating: number;
        hourlyRate: {
            node: {
                amount: number;
                currencyCode: string;
            };
        };
        totalEarnings: number;
    };
}

export interface GraphQLResponse<T> {
    data?: T;
    errors?: Record<string, unknown>[];
    error?: boolean;
    type?: string;
    details?: Record<string, unknown>;
}

export function isGraphQLResponse<T>(response: unknown): response is GraphQLResponse<T> {
    return (
        response !== null &&
        typeof response === 'object' &&
        'error' in response &&
        typeof response.error === 'boolean' &&
        (!('data' in response) || response.data === undefined || typeof response.data === 'object') &&
        (!('errors' in response) || Array.isArray(response.errors))
    );
}

/**
 * A discriminated union for all messages sent between the popup and background script.
 * This provides full type safety for `browser.runtime.sendMessage` and `onMessage` listeners.
 */
export type BackgroundMessage =
  | { action: 'updatePopupDisplay' }
  | { action: 'manualCheck'; userQuery?: string }
  | { action: 'getJobDetails'; jobCiphertext: string }
  | { action: 'getTalentProfile'; profileCiphertext: string };
