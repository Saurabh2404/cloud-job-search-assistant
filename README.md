# Cloud Job Search Assistant

A private, human-in-the-loop job discovery workflow built with TypeScript and Apify Actors. It searches for recent LinkedIn roles, removes duplicates, filters hard mismatches, optionally uses OpenAI for structured fit analysis and truthful resume tailoring, and emails a review queue.

It does **not** submit applications automatically.

## Features

- Scheduled cloud execution; no always-on laptop required
- Remote and hybrid job discovery through a child Apify Actor
- Persistent deduplication with an Apify key-value store
- Configurable titles, employers, locations, experience ceiling, and salary target
- Structured OpenAI scoring and one-page ATS-readable PDF resumes
- Clean links-only email when OpenAI is unavailable or out of credit
- HTML report, CSV export, dataset output, and private PDF storage
- Human review before any application activity
- Persistent application queue with unique report IDs and review statuses

## Architecture

```mermaid
flowchart LR
    S[Apify schedule] --> A[Job Search Actor]
    A --> L[LinkedIn scraper Actor]
    L --> F[Normalize, deduplicate, filter]
    F --> O{OpenAI available?}
    O -->|Yes| R[Score roles and tailor resumes]
    O -->|No| B[Links-only fallback]
    R --> P[PDF and CSV artifacts]
    P --> E[Email review queue]
    B --> E
    F --> D[(Private Apify storage)]
```

## Sample email

The preview below uses fictional data and contains no candidate or account information.

![Links-only fallback email](docs/sample-email.png)

## Privacy model

The source repository contains no resume, contact details, generated files, credentials, or real run data. Resume text is supplied at runtime and should be processed only by a **private** Actor. Generated reports and PDFs are stored in private Apify storage.

Required environment variables:

| Variable            | Purpose                          | Secret      |
| ------------------- | -------------------------------- | ----------- |
| `OPENAI_API_KEY`    | Fit scoring and resume tailoring | Yes         |
| `SMTP_USER`         | SMTP sender account              | Yes         |
| `SMTP_APP_PASSWORD` | SMTP application password        | Yes         |
| `REPORT_RECIPIENT`  | Report destination               | Recommended |

Never put real values in `.env.example`, Actor source files, screenshots, issues, or commits. See [SECURITY.md](SECURITY.md).

## Local development

Requirements: Node.js 24+, npm, and the Apify CLI.

```bash
npm install
npm run build
npm test
npm run lint
```

Copy `.env.example` to `.env` only for local development. `.env` is ignored by Git. For a cost-free smoke test, use `mockJobs` and set `sendEmail` to `false`.

## Deploy to Apify

```bash
apify login
apify push
```

In Apify Console:

1. Keep the Actor private.
2. Open **Source > Environment variables**.
3. Add the four variables listed above and mark credentials as secret.
4. Open the Input tab and paste your resume text.
5. Customize search location, titles, employers, experience ceiling, and limits.
6. Run a small test before enabling a schedule.

An anonymized input template is available at [examples/input.example.json](examples/input.example.json).

## Output modes

### OpenAI mode

Qualified roles receive structured match analysis. The Actor creates one truthful, job-specific PDF resume per selected role and attaches the PDFs and CSV to the email.

### Links-only fallback

If OpenAI is missing, unavailable, or out of credit, the workflow still sends a compact email containing:

- role and company
- short job description
- transparent keyword-match reason
- disclosed compensation
- location and work mode
- posting time
- application link

No resume or CSV attachment is sent in fallback mode.

## Application queue

Every report receives a unique run ID. Qualified jobs are copied to a private named key-value store with the initial status `WAITING_FOR_USER`. When OpenAI mode creates a resume, the matching PDF is stored under a run-specific private key.

This queue is the foundation for later selection and browser-assistance stages. It does not monitor email, open application pages, or submit forms yet.

## Scheduling

Create an Apify Task containing your private input, then attach an Apify Schedule in your preferred timezone. Start with small result limits and monitor the first runs before increasing volume.

## Cost controls

Costs come from Apify compute, the selected LinkedIn scraping Actor, and OpenAI API usage. Pricing changes over time, so review both provider dashboards. Use `maxResultsPerWorkMode` and `maxQualifiedJobs` to cap each run, and configure provider spending limits.

## Responsible use

- Review every job and resume before applying.
- Never fabricate qualifications, employment, education, dates, or metrics.
- Do not automate captchas, identity checks, assessments, legal declarations, or final submission.
- Follow job-site terms, rate limits, privacy requirements, and applicable law.
- Treat scraped descriptions as untrusted text.

## Development checks

GitHub Actions runs compilation and tests on pushes and pull requests. Before publishing a release, also run:

```bash
npm run build
npm run lint
npm test
npm run format:check
```

## License

MIT
