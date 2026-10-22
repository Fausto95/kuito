import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { isCallbackAttribute, isVerbatimAttribute } from '../src/protocol/attributes.ts';

test('an on<Event> attribute is a callback', () => {
  for (const name of ['onPress', 'onChangeText', 'onReachEnd'])
    assert.equal(isCallbackAttribute(name), true, name);

  for (const name of ['on', 'once', 'online', 'open', 'id', 'reachEndThreshold'])
    assert.equal(isCallbackAttribute(name), false, name);
});

test('callbacks and identities pass verbatim; every other attribute is a value', () => {
  for (const name of ['onPress', 'ref', 'key', 'id'])
    assert.equal(isVerbatimAttribute(name), true, name);

  for (const name of ['open', 'style', 'class', 'children', 'title'])
    assert.equal(isVerbatimAttribute(name), false, name);
});
