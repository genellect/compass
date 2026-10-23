import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// `extras` carries the pins that live outside the Dev Container definition:
// the Library API interpreter pin and the Claude Code cloud session settings.
export function verifyToolchain(config, env, nodeVersion, extras = {}) {
  const features = config.features;
  const feature = name => features[`ghcr.io/devcontainers/features/${name}`];
  assert.equal(nodeVersion.trim(), env.NODE_VERSION, 'Node pin differs from toolchain.env');
  assert.equal(feature('node:1').version, env.NODE_VERSION, 'Dev Container Node pin drift');
  assert.equal(feature('node:1').pnpmVersion, env.PNPM_VERSION, 'pnpm pin drift');
  assert.equal(feature('docker-in-docker:4').version, env.DOCKER_VERSION, 'Docker pin drift');
  assert.equal(feature('docker-in-docker:4').dockerDashComposeVersion, env.DOCKER_COMPOSE_VERSION, 'Compose pin drift');
  assert.equal(feature('github-cli:1').version, env.GITHUB_CLI_VERSION, 'GitHub CLI pin drift');
  assert.equal(feature('copilot-cli:1').version, env.COPILOT_CLI_VERSION, 'Copilot CLI pin drift');
  assert.equal(feature('python:1').toolsToInstall, `uv==${env.UV_VERSION}`, 'uv pin drift');
  assert.ok(Object.values(env).every(v => v && v !== 'latest'), 'Toolchain must use explicit versions');
  if ('pythonVersion' in extras) {
    assert.equal(feature('python:1').version, env.PYTHON_VERSION, 'Dev Container Python pin drift');
    assert.equal(extras.pythonVersion.trim(), env.PYTHON_VERSION, 'services/library-api/.python-version differs from toolchain.env');
  }
  if ('claudeSettings' in extras) {
    // The committed Claude Code settings carry the same session environment as
    // the Dev Container, so both default paths run with identical flags.
    assert.deepEqual(extras.claudeSettings.env ?? {}, config.remoteEnv ?? {}, 'Claude Code env differs from Dev Container remoteEnv');
    assert.equal(config.containerEnv?.COMPASS_DEV_PROFILE, 'devcontainer', 'Dev Container must declare COMPASS_DEV_PROFILE=devcontainer');
  }
}

export function parseEnv(source) {
  return Object.fromEntries(source.trim().split(/\r?\n/).filter(l => l && !l.startsWith('#')).map(l => l.split('=')));
}

export async function checkToolchain(root = process.cwd()) {
  const read = f => readFile(path.join(root, f), 'utf8');
  const [config, source, nodeVersion, pythonVersion, claudeSettings] = await Promise.all([
    read('.devcontainer/devcontainer.json'), read('.devcontainer/toolchain.env'), read('.node-version'),
    read('services/library-api/.python-version'), read('.claude/settings.json'),
  ]);
  verifyToolchain(JSON.parse(config), parseEnv(source), nodeVersion, { pythonVersion, claudeSettings: JSON.parse(claudeSettings) });
  console.log('Toolchain source pins agree. Runtime installation is checked by dev:doctor for the detected profile.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await checkToolchain();
