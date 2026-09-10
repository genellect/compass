import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const files = [
  'README.md', 'AGENTS.md', 'CLAUDE.md', '.github/copilot-instructions.md',
  'THIRD_PARTY_NOTICES.md', 'docs/README.md', 'docs/CLOUD_DEVELOPMENT.md',
  'docs/development-workflows.md', 'docs/dependency-maintenance.md',
  'docs/documentation-maintenance.md', 'docs/legal/permissions.md', 'docs/legal/asset-register.md',
];
const errors = [];
let links = 0;
for (const file of files) {
  const source = await readFile(file, 'utf8');
  // Check file destinations, not remote availability or GitHub's translated heading slugs.
  const text = source.replace(/```[\s\S]*?```/g, '');
  for (const match of text.matchAll(/\]\((<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const href = match[1].replace(/^<|>$/g, '');
    if (/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(href)) continue;
    const destination = decodeURIComponent(href.split('#')[0]);
    if (!destination) continue;
    links++;
    try { await access(path.resolve(path.dirname(file), destination)); }
    catch { errors.push(`${file}: ${href}`); }
  }
}
if (errors.length) throw new Error('Broken local documentation links:\n' + errors.join('\n'));
console.log(`Verified ${links} local link destinations in ${files.length} maintained entry documents.`);
