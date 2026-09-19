# Security policy

## Protecting credentials

Never commit API keys, SMTP/IMAP passwords, OAuth tokens, browser cookies, resumes, generated PDFs, run inputs, screenshots, or exported datasets. Configure secrets in Apify Console under **Source > Environment variables** and mark them as secret.

Mailbox monitoring accepts commands only from `REPORT_RECIPIENT`, requires an explicit `apply` or `prepare` command, and validates the referenced private queue. Use OAuth where practical. If an app password is used, keep the Actor private and grant access only to the mailbox used for this workflow.

Browser preparation never stores account passwords or session cookies and never submits an application. Pages requiring login, CAPTCHA, OTP, assessments, or legal declarations are marked for user action.

The repository ignores common credential and artifact formats. This is defense in depth, not a substitute for reviewing staged changes before every push.

## Reporting a vulnerability

Open a private security advisory in GitHub. Do not include real credentials, resume data, or job-application records in a public issue.

## If a secret is exposed

1. Revoke it at the provider immediately.
2. Create a replacement with the smallest practical permissions.
3. Remove it from Apify and local configuration.
4. Purge it from Git history before making the repository public.
5. Review provider access logs and billing activity.
