import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

import { sendDigest } from './email.js';
import { prepareSelectedApplications } from './prepare.js';
import { selectApplicationJobs } from './queue.js';
import type { ApplicationPagePreflight, ApplicationSelectionResult } from './types.js';

export interface SelectionCommand {
    runId: string;
    jobNumbers: number[];
}

export interface MonitoredReply {
    messageId: string;
    command: SelectionCommand;
    selection: ApplicationSelectionResult;
    preflights: ApplicationPagePreflight[];
}

function requireSecret(name: string, fallbackName?: string): string {
    const value = process.env[name]?.trim() || (fallbackName ? process.env[fallbackName]?.trim() : '');
    if (!value) throw new Error(`${name} secret is missing.`);
    return value;
}

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => {
        const entities: Record<string, string> = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
        };
        return entities[character]!;
    });
}

async function sendSelectionConfirmation(reply: MonitoredReply): Promise<void> {
    const preflightByPriority = new Map(reply.preflights.map((item) => [item.priority, item]));
    const jobs = reply.selection.selectedJobs
        .map((job) => {
            const preflight = preflightByPriority.get(job.priority);
            const status = preflight?.status ?? 'READY';
            const blockers = preflight?.blockers.length ? ` Human action: ${preflight.blockers.join(', ')}.` : '';
            return `<li><strong>${job.priority}. ${escapeHtml(job.title)}</strong> at ${escapeHtml(job.company)}<br>${escapeHtml(status)}.${escapeHtml(blockers)} <a href="${escapeHtml(job.url)}">Open application</a></li>`;
        })
        .join('');
    const html = `<h2>Application choices received</h2><p>Run <code>${escapeHtml(reply.command.runId)}</code></p><ol>${jobs}</ol><p>No application was submitted. Review login, CAPTCHA, OTP, assessments, legal questions, and all entered information yourself.</p>`;
    await sendDigest(`Application choices prepared [run ${reply.command.runId}]`, html, []);
}

export function parseSelectionCommand(text: string): SelectionCommand | null {
    const runId = text.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i)?.[0];
    const commandLine = text.match(/(?:^|\n)\s*(?:apply|prepare)\b[^\n]*/im)?.[0];
    if (!runId || !commandLine) return null;
    const jobNumbers = [...new Set(commandLine.match(/\b\d{1,2}\b/g)?.map(Number) ?? [])].sort((a, b) => a - b);
    if (jobNumbers.length === 0 || jobNumbers.some((number) => number < 1 || number > 10)) return null;
    return { runId, jobNumbers };
}

export async function monitorSelectionReplies(args: {
    storeName: string;
    maximumMessages: number;
    prepareForms: boolean;
}): Promise<MonitoredReply[]> {
    const user = requireSecret('IMAP_USER', 'SMTP_USER');
    const pass = requireSecret('IMAP_APP_PASSWORD', 'SMTP_APP_PASSWORD').replace(/\s+/g, '');
    const allowedSender = requireSecret('REPORT_RECIPIENT').toLowerCase();
    const client = new ImapFlow({
        host: process.env.IMAP_HOST?.trim() || 'imap.gmail.com',
        port: Number(process.env.IMAP_PORT || 993),
        secure: true,
        auth: { user, pass },
        logger: false,
    });
    const processed: MonitoredReply[] = [];
    await client.connect();
    try {
        const lock = await client.getMailboxLock('INBOX');
        try {
            const unseen = await client.search({ seen: false }, { uid: true });
            if (!unseen) return processed;
            for (const uid of unseen.slice(-args.maximumMessages).reverse()) {
                const message = await client.fetchOne(uid, { source: true }, { uid: true });
                if (!message || !message.source) continue;
                const parsed = await simpleParser(message.source);
                const from = parsed.from?.value[0]?.address?.toLowerCase();
                if (from !== allowedSender) continue;
                const command = parseSelectionCommand(`${parsed.subject ?? ''}\n${parsed.text ?? ''}`);
                if (!command) continue;
                const selection = await selectApplicationJobs({
                    storeName: args.storeName,
                    runId: command.runId,
                    selectedJobNumbers: command.jobNumbers,
                });
                const preflights = args.prepareForms
                    ? await prepareSelectedApplications(args.storeName, command.runId)
                    : [];
                const reply = { messageId: parsed.messageId ?? `uid-${uid}`, command, selection, preflights };
                await sendSelectionConfirmation(reply);
                processed.push(reply);
                await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
            }
        } finally {
            lock.release();
        }
    } finally {
        await client.logout();
    }
    return processed;
}
