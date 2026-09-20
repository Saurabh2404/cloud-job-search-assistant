import { z } from 'zod';

import type { ActorInput } from './types.js';

export const DEFAULT_TITLES = ['Software Engineer', 'Backend Engineer', 'Full Stack Developer'];

export const DEFAULT_COMPANIES: string[] = [];

const storeNameSchema = z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .default('job-application-queue');

const searchInputSchema = z
    .object({
        mode: z.literal('search'),
        resumeText: z.string().min(200),
        targetTitles: z.array(z.string().min(2)).default(DEFAULT_TITLES),
        targetCompanies: z.array(z.string().min(2)).default(DEFAULT_COMPANIES),
        companyAllowlistOnly: z.boolean().default(false),
        excludedCompanies: z.array(z.string().min(2)).default([]),
        hybridLocations: z.array(z.string().min(2)).default([]),
        workModes: z
            .array(z.enum(['remote', 'hybrid']))
            .min(1)
            .max(2)
            .default(['remote', 'hybrid']),
        searchLocation: z.string().min(2).default('United States'),
        maximumExperienceYears: z.number().int().min(0).max(50).default(5),
        maxResultsPerWorkMode: z.number().int().min(1).max(50).default(10),
        maxQualifiedJobs: z.number().int().min(1).max(10).default(10),
        salaryTarget: z.string().default('Not specified'),
        openAiModel: z.string().default('gpt-5.6-terra'),
        linkedinScraperActorId: z
            .string()
            .regex(/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/)
            .default('apimaestro/linkedin-jobs-scraper-api'),
        linkedinScraperMode: z.enum(['generic', 'company-filtered']).default('generic'),
        stateStoreName: z
            .string()
            .regex(/^[a-z0-9-]+$/)
            .default('job-search-state'),
        applicationQueueStoreName: storeNameSchema,
        sendEmail: z.boolean().default(true),
        mockJobs: z.array(z.record(z.string(), z.unknown())).optional(),
    })
    .superRefine((value, context) => {
        if (value.companyAllowlistOnly && value.targetCompanies.length === 0) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['targetCompanies'],
                message: 'Add at least one approved company when companyAllowlistOnly is enabled.',
            });
        }
    });

const selectionInputSchema = z.object({
    mode: z.literal('select'),
    runId: z.string().uuid(),
    selectedJobNumbers: z.array(z.number().int().min(1).max(10)).min(1).max(10),
    applicationQueueStoreName: storeNameSchema,
});

const monitorInputSchema = z.object({
    mode: z.literal('monitor'),
    applicationQueueStoreName: storeNameSchema,
    maximumReplyMessages: z.number().int().min(1).max(50).default(20),
    prepareApplicationForms: z.boolean().default(true),
});

const prepareInputSchema = z.object({
    mode: z.literal('prepare'),
    runId: z.string().uuid(),
    applicationQueueStoreName: storeNameSchema,
});

export const inputSchema = z.preprocess(
    (value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
        const record = value as Record<string, unknown>;
        return { ...record, mode: record.mode ?? 'search' };
    },
    z.discriminatedUnion('mode', [searchInputSchema, selectionInputSchema, monitorInputSchema, prepareInputSchema]),
);

export type ParsedInput = z.infer<typeof inputSchema>;
export type SearchInput = Extract<ParsedInput, { mode: 'search' }>;

export function parseInput(value: ActorInput | null): ParsedInput {
    return inputSchema.parse(value ?? {});
}
