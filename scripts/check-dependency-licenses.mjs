import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function inspectLicenses(lock, policy) {
  if (lock.lockfileVersion !== 3 || !lock.packages?.['']) throw new Error('Expected npm lockfile v3.');
  const reviewed = new Set(policy.reviewedExpressions);
  const packages = Object.entries(lock.packages).filter(([location]) => location).map(([location, item]) => ({
    name: item.name ?? location.split('node_modules/').at(-1),
    version: item.version,
    location,
    license: typeof item.license === 'string' ? item.license : 'UNKNOWN',
    development: item.dev === true,
    optional: item.optional === true,
    integrity: item.integrity ?? null,
  })).sort((a, b) => a.location.localeCompare(b.location));
  if (!packages.length) throw new Error('Empty dependency inventory.');
  const findings = packages.filter(item => !reviewed.has(item.license));
  return { scope: 'npm lockfile; includes optional platform packages, not a deployed SBOM', packages, findings };
}

export async function checkLicenses(root = process.cwd()) {
  const [lock, policy] = await Promise.all([
    readFile(path.join(root, 'package-lock.json'), 'utf8').then(JSON.parse),
    readFile(path.join(root, 'docs/legal/dependency-license-policy.json'), 'utf8').then(JSON.parse),
  ]);
  const report = inspectLicenses(lock, policy);
  const output = path.join(root, 'test-results/security/npm-licenses.json');
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  if (report.findings.length) {
    throw new Error('Unreviewed dependency licenses: ' + report.findings.map(p => `${p.name}@${p.version} (${p.license})`).join(', '));
  }
  console.log(`Reviewed license expressions for ${report.packages.length} npm lockfile entries. Distribution obligations: THIRD_PARTY_NOTICES.md.`);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await checkLicenses();
