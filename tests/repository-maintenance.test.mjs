import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
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
  const extras = {
    pythonVersion: await readFile('services/library-api/.python-version', 'utf8'),
    claudeSettings: JSON.parse(await readFile('.claude/settings.json', 'utf8')),
  };
  verifyToolchain(config, env, node, extras);
  assert.throws(() => verifyToolchain(config, env, node, { ...extras, pythonVersion: '3.13' }), /python-version differs/);
  assert.throws(() => verifyToolchain(config, env, node, { ...extras, claudeSettings: { env: {} } }), /Claude Code env differs/);
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

test('every Playwright spec and node:test file is reachable from an npm script', async () => {
  const scripts = Object.values(JSON.parse(await readFile('package.json', 'utf8')).scripts).join('\n');
  const specs = (await readdir('tests/responsive')).filter(f => f.endsWith('.spec.ts')).map(f => `tests/responsive/${f}`);
  const nodeTests = (await readdir('tests')).filter(f => f.endsWith('.test.mjs')).map(f => `tests/${f}`);
  assert.ok(specs.length > 0 && nodeTests.length > 0);
  assert.deepEqual([...specs, ...nodeTests].filter(file => !scripts.includes(file)), []);
});

const ENTRY_POINTS = [
  '.devcontainer/post-create.sh', '.codex/setup.sh', '.codex/maintenance.sh',
  '.claude/hooks/session-start.sh', 'scripts/devcontainer.sh', 'scripts/devcontainer.ps1',
];

test('every environment entry point delegates to the single bootstrap', async () => {
  for (const file of ENTRY_POINTS) {
    const source = await readFile(file, 'utf8');
    assert.match(source, /scripts\/dev-bootstrap\.sh/, `${file} must call scripts/dev-bootstrap.sh`);
    assert.doesNotMatch(source, /npm ci|uv sync|playwright install|install-dependencies/, `${file} must not provision on its own`);
  }
  const devcontainer = JSON.parse(await readFile('.devcontainer/devcontainer.json', 'utf8'));
  assert.equal(devcontainer.postCreateCommand, 'bash .devcontainer/post-create.sh');
  const claude = JSON.parse(await readFile('.claude/settings.json', 'utf8'));
  const commands = claude.hooks.SessionStart.flatMap(group => group.hooks.map(hook => hook.command));
  assert.ok(commands.some(command => command.includes('.claude/hooks/session-start.sh')), 'SessionStart must run the bootstrap hook');
  assert.equal(claude.permissions, undefined, 'permission allowlists stay personal (.claude/settings.json.example)');
});

test('Claude and Codex read-only agents cover the same review perspectives', async () => {
  const names = (dir, ext) => readdir(dir).then(files => files.filter(f => f.endsWith(ext)).map(f => f.slice(0, -ext.length)).sort());
  const [claude, codex] = await Promise.all([names('.claude/agents', '.md'), names('.codex/agents', '.toml')]);
  assert.deepEqual(claude, codex);
  for (const perspective of ['repo-mapper', 'quality-reviewer', 'security-reviewer']) assert.ok(claude.includes(perspective), perspective);
});

test('doctor cloud skips match the documented Claude Code cloud limitations', async () => {
  const [doctor, docs] = await Promise.all([readFile('.devcontainer/doctor.sh', 'utf8'), readFile('docs/CLOUD_DEVELOPMENT.md', 'utf8')]);
  const items = [...doctor.matchAll(/^\s*skip "([^"]+?) -> ([^"]+)"$/gm)].map(m => [m[1], m[2]]);
  assert.ok(items.length >= 5);
  for (const [label, alternative] of items) {
    const row = docs.split('\n').find(line => line.startsWith(`| ${label} |`));
    assert.ok(row, `docs/CLOUD_DEVELOPMENT.md lacks a row for: ${label}`);
    assert.ok(row.includes(alternative), `documented alternative for ${label} must be: ${alternative}`);
  }
});

test('Playwright Chromium fallback and node_modules lock probe', async () => {
  const { resolveChromium, nodeModulesInSync } = createRequire(import.meta.url)('../scripts/dev-env.cjs');
  const root = await mkdtemp(path.join(tmpdir(), 'compass-dev-env-'));
  const explicit = resolveChromium({ root, env: { PLAYWRIGHT_CHROMIUM_EXECUTABLE: process.execPath } });
  assert.deepEqual([explicit.source, explicit.executablePath], ['PLAYWRIGHT_CHROMIUM_EXECUTABLE', process.execPath]);
  const missing = resolveChromium({ root, env: { PLAYWRIGHT_CHROMIUM_EXECUTABLE: path.join(root, 'missing') } });
  assert.notEqual(missing.source, 'PLAYWRIGHT_CHROMIUM_EXECUTABLE');

  const lock = { packages: { '': {}, 'node_modules/a': { version: '1.0.0', integrity: 'sha512-a' }, 'node_modules/opt': { version: '1.0.0', optional: true } } };
  await writeFile(path.join(root, 'package-lock.json'), JSON.stringify(lock));
  assert.equal(nodeModulesInSync(root).inSync, false);
  await mkdir(path.join(root, 'node_modules'));
  const hidden = path.join(root, 'node_modules', '.package-lock.json');
  await writeFile(hidden, JSON.stringify({ packages: { 'node_modules/a': { version: '1.0.0', integrity: 'sha512-a' } } }));
  assert.equal(nodeModulesInSync(root).inSync, true);
  await writeFile(hidden, JSON.stringify({ packages: { 'node_modules/a': { version: '0.9.0' } } }));
  assert.match(nodeModulesInSync(root).reason, /differs from locked 1\.0\.0/);
});
