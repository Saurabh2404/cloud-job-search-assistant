import { Actor, log } from 'apify';

import type { SearchInput } from './config.js';
import type { JobCandidate, RawJob, SeenState } from './types.js';

function text(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value.trim() : fallback;
}

export function normalizeJob(raw: RawJob): JobCandidate | null {
    const url = text(raw.job_url ?? raw.url);
    const title = text(raw.job_title ?? raw.title);
    const company = text(raw.company);
    if (!url.startsWith('https://www.linkedin.com/jobs/') || !title || !company) return null;

    const description = text(raw.description ?? raw.descriptionHtml).slice(0, 30_000);
    const workMode =
        text(raw.work_type) || (/\bhybrid\b/i.test(description) ? 'Hybrid (description match)' : 'Not specified');

    return {
        id: text(raw.job_id ?? raw.jobId, url.split('/').filter(Boolean).slice(-1)[0] ?? url),
        company,
        title,
        url,
        applyUrl: text(raw.apply_url, url),
        companyUrl: text(raw.company_url ?? raw.companyUrl),
        location: text(raw.location, 'Not specified'),
        workMode,
        salary: text(raw.salary, 'Not disclosed'),
        postedAt: text(raw.posted_at ?? raw.postedDate, 'Not specified'),
        applicants: text(raw.applicant_count ?? raw.applicantCount, 'Not available'),
        description,
        easyApply: raw.is_easy_apply === true,
    };
}

export function hardRejectionReason(job: JobCandidate, input: SearchInput): string {
    const combined = `${job.title}\n${job.company}\n${job.location}\n${job.workMode}\n${job.description}`.toLowerCase();
    if (input.excludedCompanies.some((company) => job.company.toLowerCase().includes(company.toLowerCase()))) {
        return 'Current or excluded employer';
    }
    if (
        input.companyAllowlistOnly &&
        !input.targetCompanies.some((company) => job.company.toLowerCase().includes(company.toLowerCase()))
    ) {
        return 'Not in approved employer list';
    }
    if (
        input.workModes.length === 1 &&
        input.workModes[0] === 'hybrid' &&
        !/\bhybrid\b/i.test(`${job.workMode}\n${job.description}`)
    ) {
        return 'No hybrid reference in the job listing';
    }
    if (/\b(on[- ]?site only|office only)\b/i.test(combined)) return 'On-site-only role';
    if (/\b(temporary|one[- ]month|1 month|unpaid)\b/i.test(combined)) return 'Temporary or unsuitable engagement';
    const experienceRequirement = combined.match(
        /\b(?:minimum|min\.?|at least|requires?)\s+(?:of\s+)?(\d{1,2})\+?\s+years?\b/i,
    );
    if (experienceRequirement?.[1] && Number(experienceRequirement[1]) > input.maximumExperienceYears) {
        return `Hard experience requirement exceeds ${input.maximumExperienceYears} years`;
    }
    return '';
}

export async function fetchJobs(input: SearchInput): Promise<JobCandidate[]> {
    if (input.mockJobs?.length) {
        log.info('Using mock jobs; no child Actor will be charged.');
        return input.mockJobs
            .map((job) => normalizeJob(job as RawJob))
            .filter((job): job is JobCandidate => job !== null);
    }

    const keywords = input.targetTitles.map((title) => `"${title}"`).join(' OR ');
    const searchModes = input.linkedinScraperMode === 'company-filtered' ? ['approved companies'] : input.workModes;
    const batches = await Promise.all(
        searchModes.map(async (workMode) => {
            log.info(`Starting ${workMode} LinkedIn job search.`, { limit: input.maxResultsPerWorkMode });
            const childInput =
                input.linkedinScraperMode === 'company-filtered'
                    ? {
                          keywordsList: input.targetTitles,
                          location: input.searchLocation,
                          companyFilter: input.targetCompanies,
                          datePosted: 'past_24_hours',
                          fetchJobDetails: true,
                          titleOnly: false,
                          maxResults: input.maxResultsPerWorkMode,
                          maxResultsPerSearch: input.maxResultsPerWorkMode,
                      }
                    : {
                          keywords,
                          location: input.searchLocation,
                          remote: workMode,
                          sort: 'recent',
                          date_posted: 'day',
                          limit: input.maxResultsPerWorkMode,
                      };
            const run = await Actor.call(input.linkedinScraperActorId, childInput);
            if (run.status !== 'SUCCEEDED' || !run.defaultDatasetId) {
                throw new Error(`LinkedIn child Actor failed for ${workMode}: ${run.status}`);
            }
            const dataset = await Actor.openDataset(run.defaultDatasetId);
            const { items } = await dataset.getData({ limit: input.maxResultsPerWorkMode });
            return items as RawJob[];
        }),
    );

    const unique = new Map<string, JobCandidate>();
    for (const raw of batches.flat()) {
        const job = normalizeJob(raw);
        if (job) unique.set(job.url, job);
    }
    return [...unique.values()];
}

export async function removeSeenJobs(
    jobs: JobCandidate[],
    stateStoreName: string,
): Promise<{
    fresh: JobCandidate[];
    state: SeenState;
}> {
    const store = await Actor.openKeyValueStore(stateStoreName);
    const state = (await store.getValue<SeenState>('STATE')) ?? { urls: {} };
    return { fresh: jobs.filter((job) => !state.urls[job.url]), state };
}

export async function saveSeenJobs(
    stateStoreName: string,
    state: SeenState,
    jobs: Pick<JobCandidate, 'url'>[],
): Promise<void> {
    const store = await Actor.openKeyValueStore(stateStoreName);
    const now = new Date().toISOString();
    const nextUrls = { ...state.urls };
    for (const job of jobs) nextUrls[job.url] = now;
    const entries = Object.entries(nextUrls)
        .sort((a, b) => b[1].localeCompare(a[1]))
        .slice(0, 5_000);
    await store.setValue('STATE', { urls: Object.fromEntries(entries) });
}
