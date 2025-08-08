
import { z } from 'zod';
import { CleanJobSchema } from '../schemas';

export type Tier = 'EntryLevel' | 'IntermediateLevel' | 'ExpertLevel';

export type Job = z.infer<typeof CleanJobSchema>;

export interface ProcessedJob extends Job {
  isExcludedByTitleFilter: boolean;
  isLowPriorityBySkill: boolean;
  isLowPriorityByClientCountry: boolean;
}


export type GraphQLResponse<T> =
  | {
      data: T;
      errors?: never;
      error?: false;
    }
  | {
      data?: never;
      errors?: Record<string, unknown>[];
      error: true;
      type: 'http' | 'network' | 'graphql' | 'parsing' | 'validation' | 'auth';
      details: Record<string, unknown>;
    };

export function isGraphQLResponse<T>(
  response: GraphQLResponse<T> | T
): response is GraphQLResponse<never> {
  return (response as GraphQLResponse<T>)?.error === true;
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
