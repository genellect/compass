# Security policy

## Supported code

Security fixes are prepared against the default branch. Deployed revisions are
supported only when their commit SHA matches a reviewed, passing release gate.

## Reporting a vulnerability

Do not open a public issue for authentication, authorization, personal-data,
Google Drive, database, or secret-handling vulnerabilities. Use this
repository's private vulnerability reporting form under **Security → Advisories
→ Report a vulnerability** when available. If the form is unavailable, contact
the maintainer privately at [contact@yuto-matsui.com](mailto:contact@yuto-matsui.com).
This address is the existing public business contact; do not send sensitive values.

Never include real access tokens, OAuth credentials, database URLs, Drive IDs,
administrator addresses, registration records, or copied production responses
in a report. Describe the affected route and reproduction with synthetic data.
If a real secret may have been exposed, revoke or rotate it before further
testing if you are its authorized operator, and report only the secret type and
version identifier. Otherwise notify the operator privately. Repository access
does not authorize changing production credentials or rewriting shared history.

Dependency checks and their limits are documented in
[Dependency Maintenance](../docs/dependency-maintenance.md). A vulnerable package
version does not establish exploitation; incident assessment requires evidence
from the affected runtime and the relevant time period.

## Disclosure boundary

The source, route names, input schema, eligibility rules, and OAuth client IDs
are public information. A report is security-relevant when an attacker can
bypass server-side authorization, retrieve another person's data, forge a
privileged operation, or obtain a non-public credential without already
possessing an authorized owner identity.
