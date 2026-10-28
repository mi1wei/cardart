import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./check-runtime.mjs', import.meta.url));
test('runtime preflight decodes a bundled image on the current target', () => {
  const result = spawnSync(process.execPath, [script, '--platform', process.platform, '--arch', process.arch], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.image.width, 32);
  assert.equal(report.image.height, 32);
});

test('runtime preflight rejects a foreign architecture before packaging', () => {
  const result = spawnSync(process.execPath, [script, '--platform', process.platform, '--arch', process.arch === 'arm64' ? 'x64' : 'arm64'], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /target.*match/i);
});
