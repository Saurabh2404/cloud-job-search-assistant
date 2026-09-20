import { describe, expect, it } from 'vitest';

import { parseInput } from '../src/config.js';
import { scoreJobsWithoutAi } from '../src/fallback.js';
import { hardRejectionReason, normalizeJob } from '../src/jobs.js';
import { parseSelectionCommand } from '../src/mailbox.js';
import { createResumePdf } from '../src/pdf.js';
import { applyApplicationSelection, buildApplicationQueueRun } from '../src/queue.js';
import { buildResumeCustomizationPayload, tailoredResumeSchema } from '../src/resume.js';
import { buildCsv, buildEmailHtml } from '../src/report.js';
import type { ScoredJob } from '../src/types.js';

const input = parseInput({
    resumeText: 'Java backend developer with Spring Boot and Oracle DB experience. '.repeat(10),
    maximumExperienceYears: 2,
});

describe('job validation', () => {
    it('parses an explicit email reply command', () => {
        expect(
            parseSelectionCommand(
                'Re: Daily shortlist\nApply jobs 6, 1, and 3\nRun: 123e4567-e89b-42d3-a456-426614174000',
            ),
        ).toEqual({
            runId: '123e4567-e89b-42d3-a456-426614174000',
            jobNumbers: [1, 3, 6],
        });
        expect(parseSelectionCommand('Run: 123e4567-e89b-42d3-a456-426614174000')).toBeNull();
    });

    it('accepts selection input without a resume', () => {
        expect(
            parseInput({
                mode: 'select',
                runId: '00000000-0000-4000-8000-000000000000',
                selectedJobNumbers: [1, 3],
            }),
        ).toMatchObject({ mode: 'select', selectedJobNumbers: [1, 3] });
    });

    it('accepts a configurable LinkedIn scraper Actor', () => {
        expect(
            parseInput({
                resumeText: 'Backend engineer experienced with APIs, databases, testing, and cloud delivery. '.repeat(
                    5,
                ),
                linkedinScraperActorId: 'example-user/example-linkedin-scraper',
            }),
        ).toMatchObject({ linkedinScraperActorId: 'example-user/example-linkedin-scraper' });
    });

    it('allows a wider raw scan while keeping qualified output separately capped', () => {
        expect(
            parseInput({
                resumeText: 'Backend engineer experienced with APIs, databases, testing, and cloud delivery. '.repeat(
                    5,
                ),
                maxResultsPerWorkMode: 50,
                maxQualifiedJobs: 10,
            }),
        ).toMatchObject({ maxResultsPerWorkMode: 50, maxQualifiedJobs: 10 });
    });

    it('normalizes a LinkedIn job', () => {
        const job = normalizeJob({
            company: 'Example',
            job_title: 'Java Developer',
            job_url: 'https://www.linkedin.com/jobs/view/123',
            description: 'Build Java services.',
            work_type: 'Remote',
        });
        expect(job).toMatchObject({ id: '123', company: 'Example', title: 'Java Developer', workMode: 'Remote' });
    });

    it('rejects a hard three-year requirement', () => {
        const job = normalizeJob({
            company: 'Example',
            job_title: 'Java Developer',
            job_url: 'https://www.linkedin.com/jobs/view/123',
            description: 'Requires at least 3 years of professional experience.',
            work_type: 'Remote',
        });
        expect(job && hardRejectionReason(job, input)).toContain('exceeds 2 years');
    });

    it('strictly rejects employers outside an approved hybrid-only search', () => {
        const job = normalizeJob({
            company: 'Small Example Startup',
            job_title: 'Java Developer',
            job_url: 'https://www.linkedin.com/jobs/view/789',
            description: 'Build Java services.',
            work_type: 'Remote',
        });
        const approvedInput = parseInput({
            resumeText: 'Java backend developer with Spring Boot and Oracle DB experience. '.repeat(10),
            targetCompanies: ['Barclays'],
            companyAllowlistOnly: true,
            workModes: ['hybrid'],
        });
        expect(job && hardRejectionReason(job, approvedInput)).toBe('Not in approved employer list');
    });
});

describe('artifacts', () => {
    it('creates a transparent fallback job score', () => {
        const candidate = normalizeJob({
            company: 'Example',
            job_title: 'Java Backend Engineer',
            job_url: 'https://www.linkedin.com/jobs/view/456',
            description: 'Build Java Spring Boot REST APIs with Kafka and Docker.',
            work_type: 'Remote',
            location: 'India',
        });
        expect(candidate).not.toBeNull();
        const scored = scoreJobsWithoutAi([candidate!], [])[0]!;
        expect(scored.included).toBe(true);
        expect(scored.whyMatch[0]).toContain('Java');
    });

    it('escapes CSV fields', () => {
        const job = {
            id: '1',
            company: 'Example, Inc.',
            title: 'Java Engineer',
            url: 'https://www.linkedin.com/jobs/view/1',
            applyUrl: 'https://www.linkedin.com/jobs/view/1',
            companyUrl: '',
            location: 'India',
            workMode: 'Remote',
            salary: 'Not disclosed',
            postedAt: 'Today',
            applicants: '5',
            description: 'Java',
            easyApply: false,
            matchScore: 80,
            atsAlignment: 82,
            whyMatch: ['Java'],
            gaps: [],
            rejectionReason: '',
            included: true,
            priority: 1,
            resumeFileName: 'resume.pdf',
        } satisfies ScoredJob;
        expect(buildCsv([job])).toContain('"Example, Inc."');
        const fallbackEmail = buildEmailHtml({
            qualified: [job],
            rawCount: 1,
            duplicateCount: 0,
            rejectedCount: 0,
            runId: 'example-run-id',
            generationMode: 'fallback',
        });
        expect(fallbackEmail).toContain('<strong>CTC:</strong> Not disclosed');
        expect(fallbackEmail).toContain('No customized resumes are attached');
        expect(fallbackEmail).not.toContain('Resume:');
        expect(fallbackEmail).toContain('example-run-id');

        const queueRun = buildApplicationQueueRun({
            runId: 'example-run-id',
            createdAt: '2026-01-01T00:00:00.000Z',
            generationMode: 'openai',
            jobs: [job],
        });
        expect(queueRun.jobs[0]).toMatchObject({
            status: 'WAITING_FOR_USER',
            resumeKey: 'RESUME-example-run-id-1',
            resumeDataKey: 'RESUME-DATA-example-run-id-1',
        });
    });

    it('creates a one-page PDF', async () => {
        const pdf = await createResumePdf({
            header: {
                name: 'Example Candidate',
                contactLine: 'candidate@example.com | example.com/profile',
                headline: 'Backend Software Engineer',
            },
            profile: 'Backend developer building reliable services and APIs.',
            skillGroups: [
                { category: 'Languages', items: ['Java', 'SQL'] },
                { category: 'Technologies', items: ['Spring Boot', 'REST APIs'] },
            ],
            experience: [
                {
                    company: 'Example',
                    title: 'Software Engineer',
                    dates: '2025 - Present',
                    location: 'Remote',
                    bullets: ['Built backend services.', 'Tested REST APIs.'],
                },
            ],
            education: [
                {
                    institution: 'Example Institute',
                    degree: 'BE Information Technology',
                    dates: '2021 - 2025',
                    location: 'Example City',
                    details: 'GPA 3.75',
                },
            ],
            projects: [
                {
                    name: 'Search Engine',
                    technologies: 'Java',
                    link: 'https://example.com/project',
                    bullets: ['Indexed coding problems.'],
                },
            ],
            codingProfiles: [{ platform: 'Example Platform', label: 'candidate', url: 'https://example.com' }],
            achievements: ['Competitive programming achievement.'],
            targeting: {
                targetRole: 'Backend Software Engineer',
                supportedKeywords: ['Java', 'REST APIs'],
                omittedUnsupportedKeywords: ['Example unsupported tool'],
                integrityChecks: ['Identity preserved from source', 'Employment chronology preserved from source'],
            },
        });
        expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
        expect(pdf.length).toBeGreaterThan(1_000);
    });

    it('validates the generic structured resume contract', () => {
        expect(
            tailoredResumeSchema.safeParse({
                header: { name: '', contactLine: '', headline: '' },
                profile: '',
                education: [],
                skillGroups: [],
                experience: [],
                projects: [],
                codingProfiles: [],
                achievements: [],
                targeting: {
                    targetRole: '',
                    supportedKeywords: [],
                    omittedUnsupportedKeywords: [],
                    integrityChecks: [],
                },
            }).success,
        ).toBe(false);
    });

    it('supplies the LaTeX-inspired template layout to resume tailoring', () => {
        const payload = buildResumeCustomizationPayload('Source resume', { id: 'job-1' });
        expect(payload).toMatchObject({
            sectionOrder: [
                'profile',
                'education',
                'technical-skills',
                'experience',
                'projects',
                'coding-profiles',
                'achievements',
            ],
        });
        expect(JSON.stringify(payload)).toContain('Single-column, one-page ATS-readable layout');
    });

    it('marks only selected queue jobs as ready', () => {
        const jobs = [1, 2, 3].map((priority) => ({
            id: String(priority),
            company: `Example ${priority}`,
            title: 'Java Engineer',
            url: `https://example.com/jobs/${priority}`,
            applyUrl: `https://example.com/jobs/${priority}`,
            companyUrl: '',
            location: 'India',
            workMode: 'Remote',
            salary: 'Not disclosed',
            postedAt: 'Today',
            applicants: 'Not available',
            description: 'Java and Spring Boot',
            easyApply: false,
            matchScore: 80,
            atsAlignment: 80,
            whyMatch: ['Java'],
            gaps: [],
            rejectionReason: '',
            included: true,
            priority,
        })) satisfies ScoredJob[];
        const queueRun = buildApplicationQueueRun({
            runId: 'example-run-id',
            createdAt: '2026-01-01T00:00:00.000Z',
            generationMode: 'fallback',
            jobs,
        });

        const update = applyApplicationSelection(queueRun, [3, 1, 3], '2026-01-02T00:00:00.000Z');

        expect(update.result.selectedJobNumbers).toEqual([1, 3]);
        expect(update.queueRun.status).toBe('READY');
        expect(update.queueRun.jobs.map((job) => job.status)).toEqual(['READY', 'WAITING_FOR_USER', 'READY']);
        expect(() => applyApplicationSelection(queueRun, [4])).toThrow('Job numbers not found');
    });
});
