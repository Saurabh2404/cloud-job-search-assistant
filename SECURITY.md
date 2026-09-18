# Security policy

## Protecting credentials

Never commit API keys, SMTP passwords, resumes, generated PDFs, run inputs, or exported datasets. Configure secrets in Apify Console under **Source > Environment variables** and mark them as secret.

The repository ignores common credential and artifact formats. This is defense in depth, not a substitute for reviewing staged changes before every push.

## Reporting a vulnerability

Open a private security advisory in GitHub. Do not include real credentials, resume data, or job-application records in a public issue.

## If a secret is exposed

1. Revoke it at the provider immediately.
2. Create a replacement with the smallest practical permissions.
3. Remove it from Apify and local configuration.
4. Purge it from Git history before making the repository public.
5. Review provider access logs and billing activity.
