import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { inspectLicenses } from '../scripts/check-dependency-licenses.mjs';
import { verifyToolchain } from '../scripts/verify-toolchain.mjs';
import { TEXT_FILE, publicSourceFindings } from '../scripts/verify-public-source-boundary.mjs';

test('license inventory rejects unknown expressions including optional platforms', () => {
  const report = inspectLicenses({ lockfileVersion: 3, packages: {
    '': {}, 'node_modules/ordinary': { version: '1.0.0', license: 'MIT' },
    'node_modules/platform': { version: '1.0.0', license: 'Unreviewed', optional: true },
    'node_modules/missing': { version: '1.0.0' },
  } }, { reviewedExpressions: ['MIT'] });
  assert.deepEqual(report.findings.map(p => p.name), ['missing', 'platform']);
  assert.equal(report.packages.length, 3);
  assert.throws(() => inspectLicenses({ lockfileVersion: 3, packages: { '': {} } }, { reviewedExpressions: [] }), /Empty/);
});

test('toolchain validation catches the previously floating Compose pin', async () => {
  const config = JSON.parse(await readFile('.devcontainer/devcontainer.json', 'utf8'));
  const env = Object.fromEntries((await readFile('.devcontainer/toolchain.env', 'utf8')).trim().split(/\r?\n/).map(l => l.split('=')));
  const node = await readFile('.node-version', 'utf8');
  verifyToolchain(config, env, node);
  config.features['ghcr.io/devcontainers/features/docker-in-docker:4'].dockerDashComposeVersion = 'latest';
  assert.throws(() => verifyToolchain(config, env, node), /Compose pin drift/);
});

test('public scanner covers shell, Apps Script, lockfiles, SVG and LICENSE', () => {
  const marker = `ghp_${'A'.repeat(30)}`;
  for (const file of ['setup.sh', 'helper.cjs', 'Code.gs', 'uv.lock', 'icon.svg', 'LICENSE']) {
    assert.ok(TEXT_FILE.test(file), file);
    assert.deepEqual(publicSourceFindings([{ file, contents: marker }]), [{ file, rule: 'github_token' }]);
  }
  assert.equal(TEXT_FILE.test('scene.glb'), false);
});
