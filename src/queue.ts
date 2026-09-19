import { Actor } from 'apify';

import type { ApplicationQueueRun, ApplicationSelectionResult, ScoredJob } from './types.js';

export function buildApplicationQueueRun(args: {
    runId: string;
    createdAt: string;
    generationMode: 'openai' | 'fallback';
    jobs: ScoredJob[];
}): ApplicationQueueRun {
    return {
        runId: args.runId,
        createdAt: args.createdAt,
        generationMode: args.generationMode,
        status: 'WAITING_FOR_USER',
        jobs: args.jobs.map((job) => ({
            ...job,
            status: 'WAITING_FOR_USER',
            resumeKey: job.resumeFileName ? `RESUME-${args.runId}-${job.priority}` : undefined,
        })),
    };
}

export async function saveApplicationQueueRun(args: {
    storeName: string;
    queueRun: ApplicationQueueRun;
    resumeFiles: Map<string, Buffer>;
}): Promise<void> {
    const store = await Actor.openKeyValueStore(args.storeName);
    for (const job of args.queueRun.jobs) {
        if (!job.resumeKey || !job.resumeFileName) continue;
        const resume = args.resumeFiles.get(job.resumeFileName);
        if (resume) await store.setValue(job.resumeKey, resume, { contentType: 'application/pdf' });
    }
    await store.setValue(`RUN-${args.queueRun.runId}`, args.queueRun);
    await store.setValue('LATEST', { runId: args.queueRun.runId, createdAt: args.queueRun.createdAt });
}

export async function selectApplicationJobs(args: {
    storeName: string;
    runId: string;
    selectedJobNumbers: number[];
    selectedAt?: string;
}): Promise<ApplicationSelectionResult> {
    const store = await Actor.openKeyValueStore(args.storeName);
    const key = `RUN-${args.runId}`;
    const queueRun = await store.getValue<ApplicationQueueRun>(key);
    if (!queueRun) throw new Error(`Application queue run ${args.runId} was not found.`);

    const update = applyApplicationSelection(queueRun, args.selectedJobNumbers, args.selectedAt);
    await store.setValue(key, update.queueRun);
    await store.setValue(`SELECTION-${args.runId}`, update.result);
    return update.result;
}

export function applyApplicationSelection(
    queueRun: ApplicationQueueRun,
    requestedJobNumbers: number[],
    selectedAtValue?: string,
): { queueRun: ApplicationQueueRun; result: ApplicationSelectionResult } {
    const selectedJobNumbers = [...new Set(requestedJobNumbers)].sort((a, b) => a - b);
    const availableNumbers = new Set(
        queueRun.jobs.map((job) => job.priority).filter((value): value is number => value !== undefined),
    );
    const invalidNumbers = selectedJobNumbers.filter((number) => !availableNumbers.has(number));
    if (invalidNumbers.length > 0) {
        throw new Error(`Job numbers not found in run ${queueRun.runId}: ${invalidNumbers.join(', ')}.`);
    }

    const lockedNumbers = queueRun.jobs
        .filter(
            (job) =>
                job.priority !== undefined &&
                selectedJobNumbers.includes(job.priority) &&
                (job.status === 'APPROVED' || job.status === 'SUBMITTED'),
        )
        .map((job) => job.priority);
    if (lockedNumbers.length > 0) {
        throw new Error(`Jobs already approved or submitted cannot be reselected: ${lockedNumbers.join(', ')}.`);
    }

    const selected = new Set(selectedJobNumbers);
    const selectedAt = selectedAtValue ?? new Date().toISOString();
    const updatedQueueRun: ApplicationQueueRun = {
        ...queueRun,
        status: 'READY',
        jobs: queueRun.jobs.map((job) => {
            if (job.status === 'APPROVED' || job.status === 'SUBMITTED') return job;
            if (job.priority !== undefined && selected.has(job.priority)) {
                const { failureReason: _failureReason, ...rest } = job;
                return { ...rest, status: 'READY', selectedAt };
            }
            if (job.status === 'READY') {
                const { selectedAt: _selectedAt, ...rest } = job;
                return { ...rest, status: 'WAITING_FOR_USER' };
            }
            return job;
        }),
    };

    const result: ApplicationSelectionResult = {
        runId: queueRun.runId,
        selectedAt,
        selectedJobNumbers,
        selectedJobs: updatedQueueRun.jobs
            .filter((job) => job.priority !== undefined && selected.has(job.priority))
            .map((job) => ({
                priority: job.priority!,
                company: job.company,
                title: job.title,
                url: job.url,
                status: 'READY',
                resumeAvailable: Boolean(job.resumeKey),
            })),
    };
    return { queueRun: updatedQueueRun, result };
}
