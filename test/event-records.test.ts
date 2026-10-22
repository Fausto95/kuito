import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { eventBuffer, readRecord } from '../src/runtime/event-records.ts';
import { EVENT_RECORDS } from '../src/runtime/protocol.generated.ts';
import { eventLayout, writeRecord } from '../src/tests/events.ts';

// Typed event records (docs/events.md#typed-events): what a shell writes in a
// payload's layout, and what a kernel reads back out.

const GESTURE = EVENT_RECORDS.gesture.all;

test('a record reads back the payload written into it', () => {
  const numbers = eventBuffer();
  const strings = writeRecord(
    EVENT_RECORDS.scroll.List,
    { x: 0, y: 40, contentWidth: 400, contentHeight: 900, layoutWidth: 400, layoutHeight: 800 },
    numbers,
  );

  assert.deepEqual(readRecord(EVENT_RECORDS.scroll.List, numbers, strings), {
    x: 0,
    y: 40,
    contentWidth: 400,
    contentHeight: 900,
    layoutWidth: 400,
    layoutHeight: 800,
  });
});

test('booleans cross as 1 and 0; strings beside the numbers', () => {
  const numbers = eventBuffer();

  writeRecord(EVENT_RECORDS.change.Toggle, { value: true }, numbers);
  assert.deepEqual(readRecord(EVENT_RECORDS.change.Toggle, numbers, undefined), { value: true });

  const strings = writeRecord(EVENT_RECORDS.bind.List, { cell: 'c1', key: 'k1' }, numbers);

  assert.deepEqual(strings, ['c1', 'k1']);

  assert.deepEqual(readRecord(EVENT_RECORDS.bind.List, numbers, strings), {
    cell: 'c1',
    key: 'k1',
  });
});

test('an optional number left out is absent; a number JSON could not hold reads null', () => {
  const numbers = eventBuffer();

  writeRecord(GESTURE, { handlerTag: 1, state: 4, numberOfPointers: 1, pointerType: 0 }, numbers);

  assert.deepEqual(readRecord(GESTURE, numbers, undefined), {
    handlerTag: 1,
    state: 4,
    numberOfPointers: 1,
    pointerType: 0,
  });

  writeRecord(
    GESTURE,
    { handlerTag: Infinity, state: 4, numberOfPointers: 1, pointerType: 0, velocityX: -Infinity },
    numbers,
  );

  const read = readRecord(GESTURE, numbers, undefined);

  assert.equal(read.handlerTag, null);
  assert.equal(read.velocityX, null);
  assert.equal('translationX' in read, false);
});

test('no payload is layout 0; an unknown layout or the wrong strings is an error', () => {
  const numbers = eventBuffer();

  assert.deepEqual(readRecord(0, numbers, undefined), {});
  assert.throws(() => readRecord(999, numbers, undefined), /Unknown event layout 999/);
  assert.throws(() => readRecord(EVENT_RECORDS.bind.List, numbers, ['one']), /takes 2 strings/);
});

test('a shell’s payload must match its layout: no field it lacks, no required one missing', () => {
  const numbers = eventBuffer();

  assert.throws(
    () => writeRecord(EVENT_RECORDS.press.Pressable, { x: 1 }, numbers),
    /TouchPayload has no field x/,
  );

  assert.throws(
    () => writeRecord(EVENT_RECORDS.press.Pressable, { locationX: 1 }, numbers),
    /TouchPayload.locationY must be a number/,
  );
});

test('each kind’s event has its layout; an event the manifest lacks has none', () => {
  assert.equal(eventLayout('Toggle', 'change'), EVENT_RECORDS.change.Toggle);
  assert.equal(eventLayout('module:Video', 'gesture'), GESTURE, 'every kind sends gestures');
  assert.equal(eventLayout('module:Video', 'progress'), null, 'a module view’s own stays JSON');
  assert.equal(eventLayout(null, 'keyboard.didshow') !== null, true);
  assert.equal(eventLayout(null, 'ui'), null);
});
