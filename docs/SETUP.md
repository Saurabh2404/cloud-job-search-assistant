# Cloud setup guide

This guide deploys a private copy of the workflow to an Apify account. Personal data, credentials, and generated files stay outside the Git repository.

## 1. Prerequisites

- An Apify account with enough balance for this Actor and the selected LinkedIn scraper
- A Gmail account with two-step verification and an app password
- An OpenAI API key with API billing enabled for resume tailoring (optional)
- Node.js 24+, npm, Git, and the Apify CLI for deployment
- Plain text copied from the candidate's source resume

OpenAI API billing is separate from a ChatGPT subscription. Without an OpenAI key or available credit, the Actor still sends a links-only job report.

## 2. Clone and validate

```bash
git clone https://github.com/Saurabh2404/cloud-job-search-assistant.git
cd cloud-job-search-assistant
npm ci
npm run build
npm test
npm run lint
npm run format:check
```

## 3. Deploy a private Actor

```bash
apify login
apify push
```

Keep the Actor private. In its Apify environment-variable settings, add these values and mark passwords and API keys as secrets:

| Name                | Required | Value                                                         |
| ------------------- | -------- | ------------------------------------------------------------- |
| `SMTP_USER`         | Yes      | Gmail address used to send reports                            |
| `SMTP_APP_PASSWORD` | Yes      | Gmail app password, not the normal account password           |
| `REPORT_RECIPIENT`  | Yes      | Address allowed to receive reports and send selection replies |
| `OPENAI_API_KEY`    | No       | OpenAI API key for scoring and customized resumes             |
| `IMAP_USER`         | No       | Reply mailbox; defaults to `SMTP_USER`                        |
| `IMAP_APP_PASSWORD` | No       | Reply mailbox app password; defaults to `SMTP_APP_PASSWORD`   |
| `IMAP_HOST`         | No       | Defaults to `imap.gmail.com`                                  |
| `IMAP_PORT`         | No       | Defaults to `993`                                             |

Never paste these values into Actor input, source files, build logs, GitHub issues, or screenshots.

## 4. Choose a LinkedIn scraper

The default is `apimaestro/linkedin-jobs-scraper-api`. A replacement can be set with `linkedinScraperActorId` using the `username/actor-name` format.

A replacement scraper must accept these input fields:

- `keywords`
- `location`
- `remote` with `remote` or `hybrid`
- `sort`
- `date_posted`
- `limit`

Its dataset items must expose compatible fields such as `job_url`, `job_title`, `company`, `description`, `location`, `work_type`, `salary`, `posted_at`, and `apply_url`. If another Actor uses a different contract, adapt `src/jobs.ts` before deploying.

## 5. Create the search Task

Create an Apify Task from the deployed Actor and paste a private copy of [the search Task example](../examples/search-task.example.json). Replace every placeholder, especially `resumeText`, titles, locations, experience limit, and salary preference.

Run it first with:

- `sendEmail` set to `false`
- low `maxResultsPerWorkMode` and `maxQualifiedJobs` values
- `mockJobs` when a cost-free test is preferred

After checking the run output, enable email and run one live search manually. Confirm that the report arrives and that the links, ranking reasons, location, posting time, and compensation display correctly.

## 6. Create the reply-monitor Task

Create a second Task from the same Actor using [the monitor Task example](../examples/monitor-task.example.json). The `applicationQueueStoreName` must be identical in both Tasks.

Reply monitoring only accepts unread messages from `REPORT_RECIPIENT`. A valid reply contains both the command and report run ID:

```text
Apply jobs 1, 3, and 6
Run: 00000000-0000-4000-8000-000000000000
```

The monitor can inspect application pages, but it does not log in, bypass CAPTCHA or OTP, answer assessments or legal questions, or submit applications.

## 7. Add schedules

Attach schedules to the two Tasks, not directly to ad hoc Actor runs:

1. Search Task: daily at the desired local time and timezone.
2. Monitor Task: every 15 minutes, or another reasonable interval.

Apify starts the run near the scheduled time. Scraping, AI processing, and email delivery can make the report arrive several minutes later.

## 8. Production checklist

- Actor visibility is private.
- All secrets are environment variables marked secret.
- Search and monitor Tasks use the same queue-store name.
- Resume text exists only in the private search Task input.
- A links-only test succeeds without OpenAI.
- An OpenAI-mode test succeeds before expecting customized resumes.
- A reply from any unauthorized sender is ignored.
- Application preflight stops at login, CAPTCHA, OTP, assessments, and legal questions.
- Provider spending limits and Apify result caps are configured.
- Job-site terms and applicable privacy rules have been reviewed.

## 9. Updating

Pull and validate new code before redeploying:

```bash
git pull
npm ci
npm run build
npm test
apify push
```

Existing Tasks and schedules remain account-specific. Review their inputs after schema changes.
