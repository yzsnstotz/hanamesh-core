import assert from 'node:assert/strict'
import test from 'node:test'
import {marketMessages, marketContentLocale, marketLocalizedSelection} from '../src/client-locale.js'

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
