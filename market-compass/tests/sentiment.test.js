import test from 'node:test'
import assert from 'node:assert/strict'
import { annotate, categorize, newsScore, scoreHeadline } from '../src/lib/sentiment.js'

test('headline sentiment direction', () => {
  assert.ok(scoreHeadline('Apple beats estimates, raises guidance as iPhone sales surge') > 0.5)
  assert.ok(scoreHeadline('Tesla shares plunge after company cuts guidance') < -0.5)
  assert.ok(Math.abs(scoreHeadline('Apple to hold annual shareholder meeting on Tuesday')) < 0.2)
  assert.ok(scoreHeadline('Exchange hacked, $200 million stolen in exploit') < -0.5)
})

test('negation flips sentiment', () => {
  assert.ok(scoreHeadline('Company fails to beat expectations') < 0)
})

test('categories', () => {
  assert.equal(categorize('Fed holds interest rates steady as inflation cools'), 'macro')
  assert.equal(categorize('Nvidia quarterly earnings top revenue estimates'), 'earnings')
  assert.equal(categorize('SEC sues crypto exchange over unregistered securities'), 'legal')
  assert.equal(categorize('Morgan Stanley downgrades Apple, cuts price target'), 'analyst')
})

test('newsScore weights recent headlines and ignores old ones', () => {
  const now = Date.UTC(2026, 9, 1)
  const items = [
    annotate({ title: 'Stock soars to record high on strong earnings beat', time: now - 3600000 }),
    annotate({ title: 'Stock plunges in brutal selloff', time: now - 10 * 86400000 }),
  ]
  const s = newsScore(items, now)
  assert.equal(s.count, 1)
  assert.ok(s.score > 0)
  assert.equal(newsScore([], now), null)
})
