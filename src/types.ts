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
        rating: number;
    };
    skills: { name: string }[];
    _fullJobData: any;
    isExcludedByTitleFilter?: boolean;
    isLowPriorityBySkill?: boolean;
    isLowPriorityByClientCountry?: boolean;
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
    errors?: any[];
    error?: boolean;
    type?: string;
    details?: any;
}

/**
 * Determines whether the given object conforms to the `GraphQLResponse<T>` interface.
 *
 * @returns `true` if the object has a boolean `error` property and is an object; otherwise, `false`.
 */
export function isGraphQLResponse<T>(response: any): response is GraphQLResponse<T> {
    return response && typeof response === 'object' && typeof response.error === 'boolean';
}
