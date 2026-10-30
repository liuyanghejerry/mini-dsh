import { test } from 'node:test'
import assert from 'node:assert/strict'
import { versionNotes } from './release-notes.mjs'
const changelog = '# Log\n\n## [Unreleased]\n- future\n\n## [1.2.0] - 2026-10-31\n### 新增\n- 正式功能\n\n## [1.1.0]\n- old\n'
test('extracts only the requested version, including CRLF', () => {
  for (const text of [changelog, changelog.replaceAll('\n', '\r\n')]) {
    const result = versionNotes(text, 'v1.2.0')
    assert.ok(result.includes('正式功能'))
    assert.ok(!result.includes('future'))
    assert.ok(!result.includes('old'))
  }
})
test('rejects missing, empty, duplicate or invalid release sections', () => {
  assert.throws(() => versionNotes(changelog, 'v2.0.0'))
  assert.throws(() => versionNotes('## [1.2.0]\n### 新增\n', 'v1.2.0'))
  assert.throws(() => versionNotes(changelog + '\n## [1.2.0]\n- duplicate', 'v1.2.0'))
  assert.throws(() => versionNotes(changelog, '../notes'))
})
test('supports prerelease tags and the final section', () => {
  assert.ok(versionNotes('## [1.3.0-rc.1]\n- preview', 'v1.3.0-rc.1').includes('preview'))
  assert.ok(versionNotes(changelog, 'v1.1.0').includes('old'))
})
