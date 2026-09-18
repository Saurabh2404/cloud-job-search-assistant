import type { JobCandidate, ScoredJob } from './types.js';

const supportedSkills = [
    'Java',
    'Spring Boot',
    'Microservices',
    'REST APIs',
    'Oracle DB',
    'SQL',
    'Redis',
    'Kafka',
    'Docker',
    'Kubernetes',
    'Eureka Server',
    'WebLogic Server',
    'Flexcube',
    'NodeJS',
    'ExpressJS',
    'JavaScript',
    'Python',
    'C++',
    'Postman',
    'Git',
    'Linux',
    'System Design',
];

function mentionedSkills(description: string): string[] {
    const normalized = description.toLowerCase();
    return supportedSkills.filter((skill) => normalized.includes(skill.toLowerCase()));
}

export function scoreJobsWithoutAi(jobs: JobCandidate[], targetCompanies: string[]): ScoredJob[] {
    return jobs.map((job) => {
        const skills = mentionedSkills(job.description);
        const titleMatch = /(software|developer|engineer|consultant|java|backend|full.?stack)/i.test(job.title);
        const preferredCompany = targetCompanies.some((company) =>
            job.company.toLowerCase().includes(company.toLowerCase()),
        );
        const matchScore = Math.min(
            88,
            42 + (titleMatch ? 18 : 0) + Math.min(skills.length * 5, 25) + (preferredCompany ? 5 : 0),
        );
        return {
            ...job,
            included: titleMatch && skills.length > 0,
            matchScore,
            atsAlignment: Math.min(86, 45 + Math.min(skills.length * 6, 36)),
            whyMatch: skills.length
                ? [`Resume supports: ${skills.slice(0, 6).join(', ')}`]
                : ['Related software role title'],
            gaps: ['Fallback analysis used; manually verify every mandatory requirement'],
            rejectionReason: titleMatch && skills.length > 0 ? '' : 'Insufficient supported title or skill overlap',
        };
    });
}
