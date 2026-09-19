import { describe, expect, it } from 'vitest';

import { parseInput } from '../src/config.js';
import { scoreJobsWithoutAi } from '../src/fallback.js';
import { hardRejectionReason, normalizeJob } from '../src/jobs.js';
import { createResumePdf } from '../src/pdf.js';
import { buildApplicationQueueRun } from '../src/queue.js';
import { buildCsv, buildEmailHtml } from '../src/report.js';
import type { ScoredJob } from '../src/types.js';

const input = parseInput({
    resumeText: 'Java backend developer with Spring Boot and Oracle DB experience. '.repeat(10),
    maximumExperienceYears: 2,
});

describe('job validation', () => {
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
        });
    });

    it('creates a one-page PDF', async () => {
        const pdf = await createResumePdf({
            name: 'Test Candidate',
            contactLine: 'candidate@example.com',
            headline: 'Java Backend Developer',
            summary: 'Backend developer building Java and Spring Boot services.',
            skills: ['Java', 'Spring Boot', 'Oracle DB', 'REST APIs'],
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
                    details: 'CGPA 8.11',
                },
            ],
            projects: [{ name: 'Search Engine', technologies: 'Java', bullets: ['Indexed coding problems.'] }],
            achievements: ['Competitive programming achievement.'],
        });
        expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
        expect(pdf.length).toBeGreaterThan(1_000);
    });
});
