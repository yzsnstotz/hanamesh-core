import assert from 'node:assert/strict'
import test from 'node:test'
import {marketMessages, marketContentLocale, marketLocalizedSelection, marketCapabilitySelection} from '../src/client-locale.js'

test('every Market locale explicitly translates the complete namespace', () => {
  assert.deepEqual(Object.keys(marketMessages).sort(), ['en','es','id','ja','ko','pt','ru','vi','zh'])
  const keys = Object.keys(marketMessages.en).sort()
  for (const messages of Object.values(marketMessages)) {
    assert.deepEqual(Object.keys(messages).sort(), keys)
    assert.ok(Object.values(messages).every(message => message.trim()))
    for (const [key, text] of Object.entries(messages)) {
      const variables = value => [...value.matchAll(/\{[a-z]+\}/gi)].map(match => match[0]).sort()
      assert.deepEqual(variables(text), variables(marketMessages.en[key]), key)
    }
  }
})

test('mapping DSH preferences to content preserves pt-BR and uses explicit fallbacks', () => {
  assert.equal(marketContentLocale('PT'), 'pt-BR')
  assert.equal(marketContentLocale('es-MX'), 'es')
  assert.equal(marketContentLocale('de'), 'en')
  const field = {byLocale: {en: 'Search code', 'pt-BR': 'Pesquisar código'}}
  assert.deepEqual(marketLocalizedSelection(field, 'pt'), {text:'Pesquisar código',locale:'pt-BR'})
  assert.deepEqual(marketLocalizedSelection(field, 'ko'), {text:'Search code',locale:'en'})
  assert.deepEqual(marketLocalizedSelection({byLocale: {ja: '検索'}}, 'ru'), {text:'',locale:null})
  assert.deepEqual(marketLocalizedSelection({byLocale: {'pt-BR': ''}}, 'pt'), {text:'',locale:'pt-BR'})
})

test('falls back to an explicitly supplied original in its actual language', () => {
  const original = {text:'作者原文',locale:'zh'}
  const field = {byLocale: {'pt-BR': 'Organiza documentos', en: 'Organizes documents'}}
  assert.deepEqual(marketLocalizedSelection(field, 'pt', original), {text:'Organiza documentos',locale:'pt-BR'})
  assert.deepEqual(marketLocalizedSelection(field, 'ko', original), {text:'Organizes documents',locale:'en'})
  assert.deepEqual(marketLocalizedSelection({byLocale: {'pt-BR': 'Organiza documentos'}}, 'ko', original), original)
})

test('capability uses the same original summary order as Web and never labels an untagged string', () => {
  const overview = {does: {byLocale: {ja:'文書を整理'}}}
  assert.deepEqual(marketCapabilitySelection({overview,summary:{en:'Source',zh:'作者原文'}}, 'ko'), {text:'Source',locale:'en'})
  assert.deepEqual(marketCapabilitySelection({overview,summary:{en:null,zh:'作者原文'}}, 'ko'), {text:'作者原文',locale:'zh'})
  assert.deepEqual(marketCapabilitySelection({overview,summary:'Untagged source'}, 'ko'), {text:'Untagged source',locale:null})
  assert.deepEqual(marketCapabilitySelection({overview}, 'ko'), {text:'',locale:null})
})
