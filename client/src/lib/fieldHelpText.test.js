import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { FIELD_HELP_TEXT, fieldHelpFor, fieldHelpForKey } from './fieldHelpText.js'

describe('fieldHelpText', () => {
  it('returns example copy for short and detailed description keys', () => {
    assert.deepEqual(fieldHelpForKey('short_description'), FIELD_HELP_TEXT.short_description)
    assert.deepEqual(fieldHelpForKey('problem_description'), FIELD_HELP_TEXT.problem_description)
    assert.match(fieldHelpForKey('short_description').hint, /Example:/i)
    assert.match(fieldHelpForKey('problem_description').placeholder, /symptoms/i)
  })

  it('resolves help from field objects and labels', () => {
    assert.equal(
      fieldHelpFor({ key: 'short_description' }).placeholder,
      FIELD_HELP_TEXT.short_description.placeholder,
    )
    assert.equal(
      fieldHelpFor({ name: 'Detailed description' }).hint,
      FIELD_HELP_TEXT.problem_description.hint,
    )
    assert.equal(fieldHelpFor({ name: 'Unknown field' }), null)
  })
})
