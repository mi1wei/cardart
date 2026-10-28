import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { requireDisposableWindows, validateInstallationState } from './windows-installer-smoke.mjs';

const version = '0.1.0-beta.1';
const installDir = 'C:\\Program Files\\Folio';
const executable = `${installDir}\\Folio.exe`;
const uninstaller = `${installDir}\\Uninstall Folio.exe`;
const before = {
  admin: true, x64: true, installDir,
  profileDir: 'C:\\Users\\runner\\AppData\\Roaming\\Folio',
  libraryDir: 'C:\\Users\\runner\\Pictures\\\u76f8\u518c\u5e93',
  installExists: false, appExists: false, uninstallerExists: false,
  profileExists: false, libraryExists: false,
  running: [], installKeys: [], registrations: [], firewallRules: [],
};
const installed = {
  ...before, installExists: true, appExists: true, uninstallerExists: true,
  profileExists: true, libraryExists: true,
  installKeys: [{ hive: 'HKLM', location: installDir }],
  registrations: [{ hive: 'HKLM', version, uninstaller }],
  firewallRules: [{
    enabled: true, direction: 'Inbound', action: 'Allow', profile: 'Private',
    program: executable, protocol: 'TCP', remoteAddresses: ['LocalSubnet'],
  }],
};

test('system installation requires explicit acknowledgement and a disposable hosted Windows x64 runner', () => {
  const allowed = {
    platform: 'win32', arch: 'x64', confirmed: true,
    env: { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted' },
  };
  assert.doesNotThrow(() => requireDisposableWindows(allowed));
  for (const change of [
    { confirmed: false }, { platform: 'darwin' }, { arch: 'arm64' },
    { env: {} }, { env: { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'self-hosted' } },
  ]) {
    assert.throws(() => requireDisposableWindows({ ...allowed, ...change }), /disposable.*Windows|Windows.*disposable/i);
  }
});

test('the installer CLI fails before reading or executing a candidate without explicit acknowledgement', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./windows-installer-smoke.mjs', import.meta.url))], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /explicitly confirmed disposable/i);
});

test('preflight refuses any existing Folio install, user data, registration, rule or process', () => {
  assert.doesNotThrow(() => validateInstallationState(before, { phase: 'before', version }));
  for (const change of [
    { admin: false }, { x64: false }, { installExists: true },
    { profileExists: true }, { libraryExists: true }, { running: [123] },
    { installKeys: installed.installKeys }, { registrations: installed.registrations },
    { firewallRules: installed.firewallRules },
  ]) {
    assert.throws(() => validateInstallationState({ ...before, ...change }, { phase: 'before', version }), /preflight|existing|administrator|x64|running/i);
  }
});

test('installed state requires per-machine registration, no automatic launch and the exact installed version', () => {
  assert.doesNotThrow(() => validateInstallationState(installed, { phase: 'installed', version }));
  for (const change of [
    { appExists: false }, { uninstallerExists: false }, { running: [123] },
    { installKeys: [{ hive: 'HKCU', location: installDir }] },
    { registrations: [{ hive: 'HKCU', version, uninstaller }] },
    { registrations: [{ hive: 'HKLM', version: '0.1.0-beta.0', uninstaller }] },
    { registrations: [{ hive: 'HKLM', version, uninstaller: 'C:\\Other\\Uninstall.exe' }] },
  ]) {
    assert.throws(() => validateInstallationState({ ...installed, ...change }, { phase: 'installed', version }), /installed|registration|running|version/i);
  }
});

test('firewall verification rejects public, remote, wrong-program, UDP or duplicate rules', () => {
  for (const change of [
    { profile: 'Public' }, { profile: 'Private, Domain' }, { enabled: false },
    { direction: 'Outbound' }, { action: 'Block' }, { protocol: 'UDP' },
    { program: 'C:\\Other\\Folio.exe' }, { remoteAddresses: ['Any'] },
    { remoteAddresses: ['LocalSubnet', 'Any'] },
  ]) {
    assert.throws(() => validateInstallationState({
      ...installed, firewallRules: [{ ...installed.firewallRules[0], ...change }],
    }, { phase: 'installed', version }), /firewall/i);
  }
  assert.throws(() => validateInstallationState({
    ...installed, firewallRules: [installed.firewallRules[0], installed.firewallRules[0]],
  }, { phase: 'installed', version }), /firewall/i);
});

test('removal must leave no application, registration, rule or running process', () => {
  const removed = { ...before, profileExists: true, libraryExists: true };
  assert.doesNotThrow(() => validateInstallationState(removed, { phase: 'removed', version }));
  for (const change of [
    { installExists: true }, { running: [123] },
    { installKeys: installed.installKeys }, { registrations: installed.registrations },
    { firewallRules: installed.firewallRules },
  ]) {
    assert.throws(() => validateInstallationState({ ...removed, ...change }, { phase: 'removed', version }), /remov|running/i);
  }
});
