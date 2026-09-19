import { Actor } from 'apify';

import type { ApplicationQueueRun, ScoredJob } from './types.js';

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
    await store.setValue(`RUN-${args.queueRun.runId}`, args.queueRun, { contentType: 'application/json' });
    await store.setValue(
        'LATEST',
        { runId: args.queueRun.runId, createdAt: args.queueRun.createdAt },
        { contentType: 'application/json' },
    );
}
