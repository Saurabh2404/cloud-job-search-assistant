import { z } from 'zod';

import type { ActorInput } from './types.js';

export const DEFAULT_TITLES = ['Software Engineer', 'Backend Engineer', 'Full Stack Developer'];

export const DEFAULT_COMPANIES: string[] = [];

export const inputSchema = z.object({
    resumeText: z.string().min(200),
    targetTitles: z.array(z.string().min(2)).default(DEFAULT_TITLES),
    targetCompanies: z.array(z.string().min(2)).default(DEFAULT_COMPANIES),
    excludedCompanies: z.array(z.string().min(2)).default([]),
    hybridLocations: z.array(z.string().min(2)).default([]),
    searchLocation: z.string().min(2).default('United States'),
    maximumExperienceYears: z.number().int().min(0).max(50).default(5),
    maxResultsPerWorkMode: z.number().int().min(1).max(10).default(10),
    maxQualifiedJobs: z.number().int().min(1).max(10).default(10),
    salaryTarget: z.string().default('Not specified'),
    openAiModel: z.string().default('gpt-5.6-terra'),
    stateStoreName: z
        .string()
        .regex(/^[a-z0-9-]+$/)
        .default('job-search-state'),
    applicationQueueStoreName: z
        .string()
        .regex(/^[a-z0-9-]+$/)
        .default('job-application-queue'),
    sendEmail: z.boolean().default(true),
    mockJobs: z.array(z.record(z.string(), z.unknown())).optional(),
});

export type ParsedInput = z.infer<typeof inputSchema>;

export function parseInput(value: ActorInput | null): ParsedInput {
    return inputSchema.parse(value ?? {});
}
