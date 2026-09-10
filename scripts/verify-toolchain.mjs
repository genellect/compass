import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function verifyToolchain(config, env, nodeVersion) {
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
}

export async function checkToolchain(root = process.cwd()) {
  const read = f => readFile(path.join(root, f), 'utf8');
  const [config, source, nodeVersion] = await Promise.all([read('.devcontainer/devcontainer.json'), read('.devcontainer/toolchain.env'), read('.node-version')]);
  const env = Object.fromEntries(source.trim().split(/\r?\n/).filter(l => l && !l.startsWith('#')).map(l => l.split('=')));
  verifyToolchain(JSON.parse(config), env, nodeVersion);
  console.log('Toolchain source pins agree. Runtime installation is checked by dev:doctor inside the Dev Container.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await checkToolchain();
