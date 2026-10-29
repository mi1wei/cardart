import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, win32 } from 'node:path';
import { Readable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs, promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { openLibrary } from '../server/library.js';
import { importPhoto } from '../server/importer.js';
import { smokePackage } from './package-smoke.mjs';
import { fileDigest, verifyCandidateFiles } from './verify-release.mjs';

const project = resolve(fileURLToPath(new URL('../', import.meta.url)));
const run = promisify(execFile);
const samePath = (a, b) => typeof a === 'string' && typeof b === 'string' &&
  win32.resolve(a).toLowerCase() === win32.resolve(b).toLowerCase();

export function requireDisposableWindows({ platform = process.platform, arch = process.arch, env = process.env, confirmed = false } = {}) {
  if (!confirmed || platform !== 'win32' || arch !== 'x64' ||
    env.GITHUB_ACTIONS !== 'true' || env.RUNNER_ENVIRONMENT !== 'github-hosted') {
    throw new Error('Installer smoke requires an explicitly confirmed disposable GitHub-hosted Windows x64 runner');
  }
}

export function validateInstallationState(state, { phase, version }) {
  if (!state.admin || !state.x64) throw new Error('Installer preflight requires an administrator on x64');
  for (const key of ['running', 'installKeys', 'registrations', 'firewallRules']) {
    if (!Array.isArray(state[key])) throw new Error(`Invalid installation snapshot: ${key}`);
  }
  if (state.running.length) throw new Error('Folio is running; installer smoke must not stop another process');
  if (phase === 'before') {
    if (state.installExists || state.appExists || state.uninstallerExists || state.profileExists || state.libraryExists ||
      state.installKeys.length || state.registrations.length || state.firewallRules.length) {
      throw new Error('Installer preflight refuses existing Folio files, data, registrations or rules');
    }
  } else if (phase === 'installed') {
    if (!state.installExists || !state.appExists || !state.uninstallerExists ||
      state.installKeys.length !== 1 || state.installKeys[0].hive !== 'HKLM' ||
      !samePath(state.installKeys[0].location, state.installDir) ||
      state.registrations.length !== 1 || state.registrations[0].hive !== 'HKLM' ||
      state.registrations[0].version !== version ||
      !samePath(state.registrations[0].uninstaller, win32.join(state.installDir, 'Uninstall Folio.exe'))) {
      throw new Error('Installed application or per-machine registration/version is incorrect');
    }
    const [rule] = state.firewallRules;
    if (state.firewallRules.length !== 1 || rule.enabled !== true || rule.direction !== 'Inbound' ||
      rule.action !== 'Allow' || rule.profile !== 'Private' ||
      !samePath(rule.program, win32.join(state.installDir, 'Folio.exe')) ||
      !['TCP', '6'].includes(String(rule.protocol)) || !Array.isArray(rule.remoteAddresses) ||
      !rule.remoteAddresses.length || rule.remoteAddresses.some((address) => !['LocalSubnet', 'LocalSubnet4', 'LocalSubnet6'].includes(address))) {
      throw new Error('Installed firewall rule must be unique, enabled, Private, inbound TCP and LocalSubnet for the installed Folio.exe');
    }
  } else if (phase === 'removed') {
    if (state.installExists || state.appExists || state.uninstallerExists ||
      state.installKeys.length || state.registrations.length || state.firewallRules.length) {
      throw new Error('Uninstaller has not removed the application, registrations and owned firewall rule');
    }
  } else throw new Error('Unknown installation verification phase');
}

async function treeHashes(root) {
  const hashes = {};
  async function visit(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      const file = join(directory, entry.name);
      if (entry.isDirectory()) await visit(file, name);
      else if (entry.isFile()) hashes[name] = (await fileDigest(file)).sha256;
      else throw new Error('Unexpected link or special file in owned installer data');
    }
  }
  await visit(root);
  return hashes;
}

export async function smokeWindowsInstaller({ confirmed = false } = {}) {
  requireDisposableWindows({ confirmed });
  const { readBuildIdentity } = await import('./release-identity.cjs');
  const { version } = readBuildIdentity({ root: project });
  const sourceCommit = (await run('git', ['rev-parse', 'HEAD'], { cwd: project })).stdout.trim();
  const folder = join(project, 'release/candidate-win32-x64');
  const report = JSON.parse(await readFile(join(folder, 'candidate-report.json'), 'utf8'));
  assert.equal(report.target, 'win32-x64');
  await verifyCandidateFiles({ folder, report, root: project, version, sourceCommit, tag: process.env.RELEASE_TAG || null, requireReview: false });
  const installer = join(folder, `Folio-${version}-windows-x64-setup.exe`);
  const powerShell = join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
  async function snapshot() {
    const { stdout } = await run(powerShell, ['-NoProfile', '-NonInteractive', '-File', join(project, 'build/windows-installer-state.ps1')], {
      timeout: 30000, maxBuffer: 1024 * 1024,
    });
    return JSON.parse(stdout);
  }
  const before = await snapshot();
  validateInstallationState(before, { phase: 'before', version });
  assert.ok(samePath(before.installDir, join(process.env.ProgramW6432 || process.env.ProgramFiles, 'Folio')));
  assert.ok(samePath(before.profileDir, join(process.env.APPDATA, 'Folio')));
  assert.ok(win32.isAbsolute(before.picturesDir) && samePath(before.libraryDir, join(before.picturesDir, '\u76f8\u518c\u5e93')));
  for (const directory of [before.installDir, before.profileDir, before.libraryDir]) {
    await assert.rejects(lstat(directory), { code: 'ENOENT' });
  }
  const uninstaller = join(before.installDir, 'Uninstall Folio.exe');
  const guardCopy = join(project, 'release/uninstall-running-guard.exe');
  assert.ok(!/[\s"]/.test(guardCopy), 'Uninstaller guard requires the whitespace-free hosted CI workspace');
  const owner = randomUUID();
  const marker = '.folio-installer-smoke-owner';
  const owned = [];
  let attempted = false;
  let guardCopyOwned = false;
  let failure;
  async function uninstall() {
    await run(uninstaller, ['/allusers', '/S'], { timeout: 120000, windowsHide: true });
    const end = Date.now() + 60000;
    let last;
    do {
      try { validateInstallationState(await snapshot(), { phase: 'removed', version }); return; }
      catch (error) { last = error; }
      await delay(500);
    } while (Date.now() < end);
    throw last;
  }
  try {
    for (const directory of [before.profileDir, before.libraryDir]) {
      await mkdir(dirname(directory), { recursive: true });
      await mkdir(directory);
      owned.push(directory);
      await writeFile(join(directory, marker), owner, { flag: 'wx' });
    }
    // This is a preservation canary, never a production-signed license.
    await writeFile(join(before.profileDir, 'license.json'), '{"ownedInstallerFixture":true}\n', { flag: 'wx' });
    await writeFile(join(before.profileDir, 'desktop.json'), JSON.stringify({ version: 1, libraryDir: before.libraryDir }), { flag: 'wx' });
    const lib = await openLibrary(before.libraryDir);
    try {
      const album = await lib.create('Owned installer retention');
      for (const color of ['#1d5f80', '#a32f2f']) {
        const bytes = await sharp({ create: { width: 12, height: 8, channels: 3, background: color } }).png().toBuffer();
        await importPhoto(lib, album.id, Readable.from([bytes]), 'owned.png');
      }
    } finally { await lib.close(); }
    const expected = await Promise.all(owned.map(treeHashes));
    async function preserved() {
      for (const [index, directory] of owned.entries()) assert.deepEqual(await treeHashes(directory), expected[index], 'Installer changed owned user data');
    }
    attempted = true;
    console.log('Owned Windows installer phase: installing');
    await run(installer, ['/S'], { timeout: 120000, windowsHide: true });
    validateInstallationState(await snapshot(), { phase: 'installed', version });
    await preserved();
    await copyFile(uninstaller, guardCopy, constants.COPYFILE_EXCL);
    guardCopyOwned = true;
    console.log('Owned Windows installer phase: installed application smoke');
    const smoke = await smokePackage({
      appDir: before.installDir, platform: 'win32',
      whileRunning: async ({ pid, servicePid, origin }) => {
        const initial = await snapshot();
        assert.ok(initial.running.includes(pid) && initial.running.includes(servicePid), 'Owned installed main and backend must both be running');
        const albums = await (await fetch(`${origin}/api/albums`, { signal: AbortSignal.timeout(10000) })).json();
        const installedHashes = await treeHashes(before.installDir);
        for (const [phase, command, args, options] of [
          ['running installer guard', installer, ['/S'], {}],
          // _?= must be last and unquoted, avoiding the uninstaller's asynchronous self-copy.
          ['running uninstaller guard', guardCopy, ['/allusers', '/S', `_?=${before.installDir}`], { windowsVerbatimArguments: true }],
        ]) {
          console.log(`Owned Windows installer phase: ${phase}`);
          await assert.rejects(run(command, args, { timeout: 30000, windowsHide: true, ...options }), { code: 2 }, 'Running application must cause an explicit installer abort');
          const current = await snapshot();
          assert.ok(current.running.includes(pid) && current.running.includes(servicePid), 'Installer must not kill the owned main or backend');
          assert.deepEqual({ ...current, running: [] }, { ...initial, running: [] }, 'Rejected installation must not change installed state or firewall rules');
          const response = await fetch(`${origin}/api/albums`, { signal: AbortSignal.timeout(10000) });
          assert.equal(response.status, 200);
          assert.deepEqual(await response.json(), albums, 'Owned backend must remain available with the same library');
          assert.deepEqual(await treeHashes(before.installDir), installedHashes, 'Rejected installation must not change installed files');
          await preserved();
        }
      },
    });
    console.log('Owned Windows installer phase: same-version reinstall');
    await run(installer, ['/S'], { timeout: 120000, windowsHide: true });
    validateInstallationState(await snapshot(), { phase: 'installed', version });
    await preserved();
    console.log('Owned Windows installer phase: uninstalling');
    await uninstall();
    await preserved();
    return {
      target: 'win32-x64', version, sourceCommit, scope: 'disposable-hosted-runner',
      installed: true, sameVersionReinstalled: true, uninstalled: true,
      runningInstallBlocked: true, runningUninstallBlocked: true,
      privateLocalSubnetRule: true, ruleRemoved: true, userDataPreserved: true, smoke,
      windows11UacAccepted: false, twoVersionUpgradeAccepted: false,
    };
  } catch (error) { failure = error; throw error; }
  finally {
    const cleanupErrors = [];
    if (attempted && await lstat(uninstaller).then(() => true, () => false)) {
      try { await uninstall(); } catch (error) { cleanupErrors.push(error); }
    }
    for (const directory of owned) {
      try {
        if (await readFile(join(directory, marker), 'utf8') !== owner) throw new Error('Refusing to clean unowned installer fixture data');
        await rm(directory, { recursive: true, force: true });
      } catch (error) { cleanupErrors.push(error); }
    }
    if (guardCopyOwned) {
      try { await rm(guardCopy); } catch (error) { cleanupErrors.push(error); }
    }
    if (cleanupErrors.length) {
      if (!failure) throw new AggregateError(cleanupErrors, 'Owned installer cleanup failed');
      console.error('Owned installer cleanup failed:', cleanupErrors.map((error) => error.message).join('; '));
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { 'allow-disposable-runner': { type: 'boolean', default: false } } });
    console.log(JSON.stringify(await smokeWindowsInstaller({ confirmed: values['allow-disposable-runner'] })));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
