import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clearMandatoryFieldId,
  formatMandatoryFieldsAlert,
} from './mandatoryFields.js'

test('formatMandatoryFieldsAlert uses the singular highlighted-field copy', () => {
  assert.deepEqual(formatMandatoryFieldsAlert(['Short description']), {
    title: 'Mandatory field missing',
    message: 'Fill the highlighted mandatory field.',
    details: ['Short description'],
  })
})

test('formatMandatoryFieldsAlert lists multiple missing fields', () => {
  const alert = formatMandatoryFieldsAlert(['Asset', 'Priority', 'Asset'])
  assert.equal(alert.title, 'Mandatory fields missing')
  assert.equal(alert.message, 'Fill the highlighted mandatory fields.')
  assert.deepEqual(alert.details, ['Asset', 'Priority'])
})

test('clearMandatoryFieldId removes one highlighted field', () => {
  assert.deepEqual(clearMandatoryFieldId(['a', 'b'], 'a'), ['b'])
  assert.deepEqual(clearMandatoryFieldId(['a'], 'z'), ['a'])
})
