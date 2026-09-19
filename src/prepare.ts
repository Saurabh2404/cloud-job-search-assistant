import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import { Actor, log } from 'apify';
import { chromium, type Page } from 'playwright';

import type { ApplicationPagePreflight, ApplicationQueueRun } from './types.js';

const verifiedHosts = new Map<string, Promise<void>>();

function isPrivateAddress(address: string): boolean {
    const normalized = address.toLowerCase();
    if (isIP(normalized) === 4) {
        const [first, second] = normalized.split('.').map(Number);
        return (
            first === 0 ||
            first === 10 ||
            first === 127 ||
            (first === 100 && second >= 64 && second <= 127) ||
            (first === 169 && second === 254) ||
            (first === 172 && second >= 16 && second <= 31) ||
            (first === 192 && second === 168) ||
            first >= 224
        );
    }
    return normalized === '::1' || normalized === '::' || /^(?:fc|fd|fe8|fe9|fea|feb)/.test(normalized);
}

async function assertSafePublicUrl(value: string): Promise<URL> {
    const url = new URL(value);
    if (url.protocol !== 'https:') throw new Error('Only HTTPS application URLs are allowed.');
    const hostname = url.hostname.toLowerCase();
    const blockedName = hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal');
    if (blockedName || (isIP(hostname) > 0 && isPrivateAddress(hostname))) {
        throw new Error('Private or local application URLs are not allowed.');
    }
    let verification = verifiedHosts.get(hostname);
    if (!verification) {
        verification = lookup(hostname, { all: true }).then((addresses) => {
            if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
                throw new Error('Application URL resolves to a private or unavailable address.');
            }
        });
        verifiedHosts.set(hostname, verification);
    }
    await verification;
    return url;
}

async function inspectPage(
    page: Page,
    runId: string,
    priority: number,
    requestedUrl: string,
): Promise<ApplicationPagePreflight> {
    await page.goto(requestedUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(2_000);
    const details = await page.evaluate(() => {
        const visibleText = document.body?.innerText.slice(0, 50_000) ?? '';
        const fields = [...document.querySelectorAll('input, textarea, select')]
            .filter((element) => !(element instanceof HTMLInputElement && element.type === 'hidden'))
            .slice(0, 100)
            .map((element) => {
                const input = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
                const { id } = input;
                const label =
                    (id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent : '') ||
                    input.closest('label')?.textContent ||
                    input.getAttribute('aria-label') ||
                    input.getAttribute('placeholder') ||
                    '';
                return {
                    label: label.trim().replace(/\s+/g, ' ').slice(0, 200),
                    name: input.name.slice(0, 200),
                    type: input instanceof HTMLInputElement ? input.type : input.tagName.toLowerCase(),
                    required: input.required || input.getAttribute('aria-required') === 'true',
                };
            });
        const buttons = [...document.querySelectorAll('button, input[type="submit"], [role="button"]')]
            .map((element) => (element.textContent || element.getAttribute('value') || '').trim().replace(/\s+/g, ' '))
            .filter(Boolean)
            .slice(0, 50);
        return { visibleText, fields, buttons };
    });
    const pageText = details.visibleText.toLowerCase();
    const blockers = [
        [/captcha|verify you are human|security check/, 'CAPTCHA or anti-bot check'],
        [/\bsign in\b|\blog in\b|login required/, 'Login required'],
        [/one[- ]time password|\botp\b|verification code/, 'OTP or verification code required'],
        [/assessment|coding test|take the test/, 'Assessment required'],
    ]
        .filter(([pattern]) => (pattern as RegExp).test(pageText))
        .map(([, label]) => label as string);
    return {
        runId,
        priority,
        checkedAt: new Date().toISOString(),
        requestedUrl,
        finalUrl: page.url(),
        pageTitle: await page.title(),
        status: blockers.length > 0 ? 'USER_ACTION_REQUIRED' : 'PREPARED',
        blockers,
        fields: details.fields,
        buttons: details.buttons,
    };
}

export async function prepareSelectedApplications(
    storeName: string,
    runId: string,
): Promise<ApplicationPagePreflight[]> {
    const store = await Actor.openKeyValueStore(storeName);
    const key = `RUN-${runId}`;
    const queueRun = await store.getValue<ApplicationQueueRun>(key);
    if (!queueRun) throw new Error(`Application queue run ${runId} was not found.`);
    const selectedJobs = queueRun.jobs.filter((job) => job.status === 'READY');
    if (selectedJobs.length === 0) throw new Error(`Run ${runId} has no READY jobs to prepare.`);

    const browser = await chromium.launch({ headless: true });
    const results: ApplicationPagePreflight[] = [];
    try {
        for (const job of selectedJobs) {
            const priority = job.priority!;
            const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
            await context.route('**/*', async (route) => {
                const requestUrl = route.request().url();
                if (/^(?:data:|blob:|about:)/i.test(requestUrl)) return route.continue();
                try {
                    await assertSafePublicUrl(requestUrl);
                    return route.continue();
                } catch {
                    return route.abort('blockedbyclient');
                }
            });
            const page = await context.newPage();
            let result: ApplicationPagePreflight;
            try {
                const requestedUrl = (await assertSafePublicUrl(job.applyUrl || job.url)).toString();
                result = await inspectPage(page, runId, priority, requestedUrl);
                const screenshotKey = `PREFLIGHT-${runId}-${priority}.png`;
                const screenshot = await page.screenshot({ fullPage: true });
                await store.setValue(screenshotKey, screenshot, { contentType: 'image/png' });
                result.screenshotKey = screenshotKey;
            } catch (error) {
                result = {
                    runId,
                    priority,
                    checkedAt: new Date().toISOString(),
                    requestedUrl: job.applyUrl || job.url,
                    finalUrl: page.url(),
                    pageTitle: '',
                    status: 'FAILED',
                    blockers: [],
                    fields: [],
                    buttons: [],
                    error: (error as Error).message,
                };
                log.warning('Application-page preparation failed.', { runId, priority, error: result.error });
            } finally {
                await context.close();
            }
            results.push(result);
        }
    } finally {
        await browser.close();
    }

    const byPriority = new Map(results.map((result) => [result.priority, result]));
    const updatedRun: ApplicationQueueRun = {
        ...queueRun,
        status: results.some((result) => result.status !== 'PREPARED') ? 'USER_ACTION_REQUIRED' : 'PREPARED',
        jobs: queueRun.jobs.map((job) => {
            const result = job.priority === undefined ? undefined : byPriority.get(job.priority);
            if (!result) return job;
            return {
                ...job,
                status: result.status,
                failureReason: result.error,
            };
        }),
    };
    await store.setValue(key, updatedRun);
    await store.setValue(`PREFLIGHT-${runId}`, results);
    return results;
}
