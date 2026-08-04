# Security policy

## Supported code

Security fixes are prepared against the default branch. Deployed revisions are
supported only when their commit SHA matches a reviewed, passing release gate.

## Reporting a vulnerability

Do not open a public issue for authentication, authorization, personal-data,
Google Drive, database, or secret-handling vulnerabilities. Use this
repository's private vulnerability reporting form under **Security → Advisories
→ Report a vulnerability**.

Never include real access tokens, OAuth credentials, database URLs, Drive IDs,
administrator addresses, registration records, or copied production responses
in a report. Describe the affected route and reproduction with synthetic data.
If a real secret may have been exposed, revoke or rotate it before further
testing and report only the secret type and version identifier.

## Disclosure boundary

The source, route names, input schema, eligibility rules, and OAuth client IDs
are public information. A report is security-relevant when an attacker can
bypass server-side authorization, retrieve another person's data, forge a
privileged operation, or obtain a non-public credential without already
possessing an authorized owner identity.
