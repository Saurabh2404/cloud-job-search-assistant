import type { ScoredJob } from './types.js';

function escapeHtml(value: string): string {
    return value.replace(
        /[&<>'"]/g,
        (character) =>
            ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;',
            })[character] ?? character,
    );
}

function csvCell(value: string | number | boolean): string {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildCsv(jobs: ScoredJob[]): string {
    const headers = [
        'priority',
        'match_score',
        'ats_alignment',
        'company',
        'title',
        'location',
        'work_mode',
        'posted_at',
        'applicants',
        'why_match',
        'gaps',
        'application_url',
        'resume_file',
    ];
    const rows = jobs.map((job) => [
        job.priority ?? '',
        job.matchScore,
        job.atsAlignment,
        job.company,
        job.title,
        job.location,
        job.workMode,
        job.postedAt,
        job.applicants,
        job.whyMatch.join(' | '),
        job.gaps.join(' | '),
        job.applyUrl,
        job.resumeFileName ?? '',
    ]);
    return [headers, ...rows].map((row) => row.map((cell) => csvCell(cell)).join(',')).join('\n');
}

export function buildEmailHtml(args: {
    qualified: ScoredJob[];
    rawCount: number;
    duplicateCount: number;
    rejectedCount: number;
    generationMode?: 'openai' | 'fallback';
}): string {
    const shortDescription = (value: string): string => {
        const clean = value
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (!clean) return 'Description not available.';
        return clean.length > 320 ? `${clean.slice(0, 317).trim()}...` : clean;
    };
    const cards = args.qualified
        .map((job) =>
            args.generationMode === 'fallback'
                ? `
        <article style="border-top:1px solid #dfe3e8;padding:18px 0">
          <p style="margin:0 0 5px;color:#16835d;font-weight:700">Job ${job.priority}</p>
          <h3 style="margin:0 0 4px;font-size:18px">${escapeHtml(job.title)}</h3>
          <p style="margin:0 0 12px;color:#52606d">${escapeHtml(job.company)}</p>
          <p style="margin:7px 0"><strong>Description:</strong> ${escapeHtml(shortDescription(job.description))}</p>
          <p style="margin:7px 0"><strong>Why it matched:</strong> ${job.whyMatch.map(escapeHtml).join('; ')}</p>
          <p style="margin:7px 0"><strong>CTC:</strong> ${escapeHtml(job.salary || 'Not disclosed')}</p>
          <p style="margin:7px 0"><strong>Location:</strong> ${escapeHtml(job.location)}${job.workMode ? ` (${escapeHtml(job.workMode)})` : ''}</p>
          <p style="margin:7px 0"><strong>Posted:</strong> ${escapeHtml(job.postedAt || 'Not available')}</p>
          <p style="margin:12px 0 0"><a href="${escapeHtml(job.applyUrl)}" style="color:#126e4b;font-weight:700">View and apply</a></p>
        </article>`
                : `
        <article style="border-top:1px solid #dfe3e8;padding:16px 0">
          <p style="margin:0 0 5px;color:#16835d;font-weight:700">${job.matchScore}% match · ${job.atsAlignment}% ATS alignment · Job ${job.priority}</p>
          <h3 style="margin:0 0 4px;font-size:18px">${escapeHtml(job.title)}</h3>
          <p style="margin:0 0 10px;color:#52606d">${escapeHtml(job.company)} · ${escapeHtml(job.location)} · ${escapeHtml(job.workMode)} · ${escapeHtml(job.postedAt)}</p>
          <p><strong>Why you match:</strong> ${job.whyMatch.map(escapeHtml).join('; ')}</p>
          <p><strong>Honest gaps:</strong> ${job.gaps.length ? job.gaps.map(escapeHtml).join('; ') : 'None identified'}</p>
          <p><a href="${escapeHtml(job.applyUrl)}">Open application</a> · Resume: ${escapeHtml(job.resumeFileName ?? 'Unavailable')}</p>
        </article>`,
        )
        .join('');

    return `<!doctype html><html><body style="margin:0;background:#f4f6f8;color:#17202a;font-family:Arial,sans-serif">
      <main style="max-width:760px;margin:0 auto;padding:24px 12px"><section style="background:#fff;border:1px solid #dfe3e8;padding:24px">
        <h1 style="margin:0 0 8px">Your daily job shortlist</h1>
        <p style="color:#52606d">${args.generationMode === 'fallback' ? 'OpenAI was unavailable, so this report contains a clean links-only shortlist. No customized resumes are attached.' : 'Prepared by Apify + OpenAI. Human review is required before applying.'}</p>
        <div style="margin:20px 0;padding:14px;background:#eef6f2;border-left:4px solid #16835d"><strong>Run summary</strong><br>${args.rawCount} collected · ${args.duplicateCount} duplicates removed · ${args.qualified.length} qualified · ${args.rejectedCount} rejected</div>
        ${cards || '<p>No suitable fresh matches passed validation today.</p>'}
        <p style="margin-top:24px;padding-top:16px;border-top:1px solid #dfe3e8"><strong>To continue:</strong> return to Codex and say, for example, “Apply to jobs 1, 3, and 6.” No application has been submitted automatically.</p>
      </section></main></body></html>`;
}
