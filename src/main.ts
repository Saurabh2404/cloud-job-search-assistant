import { randomUUID } from 'node:crypto';

import { Actor, log } from 'apify';

import { scoreJobs, tailorResume } from './ai.js';
import { parseInput } from './config.js';
import { type EmailAttachment, sendDigest } from './email.js';
import { scoreJobsWithoutAi } from './fallback.js';
import { fetchJobs, hardRejectionReason, removeSeenJobs, saveSeenJobs } from './jobs.js';
import { createResumePdf } from './pdf.js';
import { buildApplicationQueueRun, saveApplicationQueueRun, selectApplicationJobs } from './queue.js';
import { buildCsv, buildEmailHtml } from './report.js';
import type { ActorInput, ScoredJob } from './types.js';

function safeFilePart(value: string): string {
    return (
        value
            .replace(/[^a-zA-Z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 45) || 'Job'
    );
}

await Actor.init();

async function runActor(): Promise<void> {
    const input = parseInput(await Actor.getInput<ActorInput>());
    if (input.mode === 'select') {
        const selection = await selectApplicationJobs({
            storeName: input.applicationQueueStoreName,
            runId: input.runId,
            selectedJobNumbers: input.selectedJobNumbers,
        });
        await Actor.setValue('OUTPUT', { mode: 'select', ...selection });
        log.info('Application choices saved for human review.', {
            runId: selection.runId,
            selectedJobNumbers: selection.selectedJobNumbers,
        });
        return;
    }

    const runId = randomUUID();
    const generatedAt = new Date().toISOString();
    const rawJobs = await fetchJobs(input);
    const { fresh, state } = await removeSeenJobs(rawJobs, input.stateStoreName);
    const duplicateCount = rawJobs.length - fresh.length;
    const preRejected: ScoredJob[] = [];
    const candidates = fresh.filter((job) => {
        const reason = hardRejectionReason(job, input);
        if (!reason) return true;
        preRejected.push({
            ...job,
            included: false,
            matchScore: 0,
            atsAlignment: 0,
            whyMatch: [],
            gaps: [],
            rejectionReason: reason,
        });
        return false;
    });

    let generationMode: 'openai' | 'fallback' = 'openai';
    let scored: ScoredJob[];
    try {
        scored = await scoreJobs({
            jobs: candidates,
            resumeText: input.resumeText,
            targetCompanies: input.targetCompanies,
            hybridLocations: input.hybridLocations,
            salaryTarget: input.salaryTarget,
            searchLocation: input.searchLocation,
            maximumExperienceYears: input.maximumExperienceYears,
            model: input.openAiModel,
        });
    } catch (error) {
        generationMode = 'fallback';
        log.warning('OpenAI scoring unavailable; continuing in fallback mode.', { error: (error as Error).message });
        scored = scoreJobsWithoutAi(candidates, input.targetCompanies);
    }
    const qualified = scored
        .filter((job) => job.included && job.matchScore >= 55)
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, input.maxQualifiedJobs);

    const attachments: EmailAttachment[] = [];
    for (const [index, job] of qualified.entries()) {
        job.priority = index + 1;
        if (generationMode === 'fallback') continue;
        let resume;
        try {
            resume = await tailorResume({ job, resumeText: input.resumeText, model: input.openAiModel });
        } catch (error) {
            generationMode = 'fallback';
            attachments.length = 0;
            for (const qualifiedJob of qualified) delete qualifiedJob.resumeFileName;
            log.warning('OpenAI resume tailoring unavailable; sending a clean links-only email.', {
                jobId: job.id,
                error: (error as Error).message,
            });
            break;
        }
        const pdf = await createResumePdf(resume);
        job.resumeFileName = `${String(index + 1).padStart(2, '0')}_${safeFilePart(job.company)}_${safeFilePart(job.title)}_${safeFilePart(resume.name)}_Resume.pdf`;
        attachments.push({ filename: job.resumeFileName, content: pdf, contentType: 'application/pdf' });
        await Actor.setValue(`RESUME-${String(index + 1).padStart(2, '0')}`, pdf, { contentType: 'application/pdf' });
    }

    const csv = buildCsv(qualified);
    const rejected = [...preRejected, ...scored.filter((job) => !qualified.some((item) => item.url === job.url))];
    const queueRun = buildApplicationQueueRun({ runId, createdAt: generatedAt, generationMode, jobs: qualified });
    const resumeFiles = new Map(
        attachments
            .filter((attachment): attachment is EmailAttachment & { content: Buffer } =>
                Buffer.isBuffer(attachment.content),
            )
            .map((attachment) => [attachment.filename, attachment.content]),
    );
    await saveApplicationQueueRun({
        storeName: input.applicationQueueStoreName,
        queueRun,
        resumeFiles,
    });
    const html = buildEmailHtml({
        rawCount: rawJobs.length,
        duplicateCount,
        qualified,
        rejectedCount: rejected.length,
        runId,
        generationMode,
    });
    const emailAttachments =
        generationMode === 'fallback'
            ? []
            : [{ filename: 'qualified-jobs.csv', content: csv, contentType: 'text/csv' }, ...attachments];
    await Actor.setValue('REPORT', html, { contentType: 'text/html' });
    await Actor.setValue('QUALIFIED-JOBS', csv, { contentType: 'text/csv' });

    let emailStatus = 'Skipped by input';
    if (input.sendEmail) {
        const modeLabel = generationMode === 'fallback' ? ' [links only]' : '';
        const messageId = await sendDigest(
            `Daily job shortlist: ${qualified.length} qualified matches${modeLabel} [run ${runId}]`,
            html,
            emailAttachments,
        );
        emailStatus = `Sent (${messageId})`;
    }

    for (const job of qualified) await Actor.pushData(job);
    await saveSeenJobs(input.stateStoreName, state, qualified);
    await Actor.setValue('OUTPUT', {
        runId,
        generatedAt,
        rawCount: rawJobs.length,
        duplicateCount,
        candidateCount: candidates.length,
        qualifiedCount: qualified.length,
        rejectedCount: rejected.length,
        resumeCount: attachments.filter((item) => item.contentType === 'application/pdf').length,
        emailStatus,
        generationMode,
    });
    log.info('Cloud job-search run completed.', {
        raw: rawJobs.length,
        duplicates: duplicateCount,
        qualified: qualified.length,
        rejected: rejected.length,
        emailSent: input.sendEmail,
        runId,
    });
}

try {
    await runActor();
} catch (error) {
    log.exception(error as Error, 'Cloud job-search run failed.');
    await Actor.fail({ statusMessage: 'Cloud job-search run failed. Check the run log for details.' });
}

await Actor.exit();
