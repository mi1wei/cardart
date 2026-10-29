import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import yaml from 'js-yaml';

const checks = yaml.load(await readFile(new URL('../.github/workflows/desktop-checks.yml', import.meta.url), 'utf8'));
test('main builds allocate a tag before draft preparation and pass its identity to both native targets', () => {
  assert.equal(checks.jobs['main-tag'].needs, 'resolve-source');
  assert.equal(checks.jobs['self-test-prepare'].needs, 'main-tag');
  assert.equal(checks.jobs['main-tag'].permissions.contents, 'write');
  assert.equal(checks.jobs['resolve-source'].permissions?.contents || checks.permissions.contents, 'read');
  assert.equal(checks.jobs['self-test-prepare'].steps.find((s) => s.id === 'draft').env.RELEASE_TAG,
    '${{ needs.main-tag.outputs.tag }}');
  const native = checks.jobs['self-test-native'];
  assert.equal(native.env.RELEASE_TAG, '${{ needs.self-test-prepare.outputs.build_tag }}');
  assert.equal(native.env.SOURCE_COMMIT, '${{ needs.self-test-prepare.outputs.source_commit }}');
  assert.deepEqual(native.strategy.matrix.include.map((target) => `${target.platform}-${target.arch}`).sort(), ['darwin-arm64', 'win32-x64']);
  assert.equal(native.steps.filter((step) => step.uses?.startsWith('actions/checkout@'))[0].with['fetch-depth'], 0);
  assert.equal(checks.jobs['self-test-finish'].env.SELF_TEST_BUILD_TAG, '${{ needs.self-test-prepare.outputs.build_tag }}');
});

test('PRs remain read-only while distinct main pushes cannot cancel each other before tagging', () => {
  assert.equal(checks.permissions.contents, 'read');
  assert.match(checks.jobs.native.if, /pull_request/);
  assert.match(checks.jobs['resolve-source'].if, /github\.repository == 'mi1wei\/cardart'/);
  assert.match(checks.concurrency.group, /pull_request.*github\.ref.*github\.run_id/);
  assert.equal(checks.jobs['main-tag'].concurrency['cancel-in-progress'], false);
  assert.match(checks.jobs['main-tag'].concurrency.group, /needs\.resolve-source\.outputs\.source_commit/);
});
