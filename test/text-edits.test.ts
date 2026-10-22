import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { formatEdit, type TextEdit } from '../src/runtime/text-edits.ts';
import { amount, cardNumber, expiry } from './fixtures/headless/app/formats.ts';

/** A field's text with its caret written as `|`, or its selection as `[` and `]`. */
function field(written: string): TextEdit {
  const text = written.replace(/[|[\]]/g, '');
  const caret = written.indexOf('|');
  const start = caret === -1 ? written.indexOf('[') : caret;
  const end = caret === -1 ? written.indexOf(']') - 1 : caret;

  return { text, start, end };
}

function written({ text, start, end }: TextEdit): string {
  if (start === end) return text.slice(0, start) + '|' + text.slice(start);

  return text.slice(0, start) + '[' + text.slice(start, end) + ']' + text.slice(end);
}

const formatted = (format: (text: string) => string, typed: string) =>
  written(formatEdit(format, field(typed)));

test('a card number groups its digits, the caret after the digit just typed', () => {
  assert.equal(formatted(cardNumber, '42424|'), '4242 4|');
  assert.equal(formatted(cardNumber, '4242 4242 4242 4242|'), '4242 4242 4242 4242|');
  assert.equal(formatted(cardNumber, '429|242 4242'), '429|2 4242 42');
  assert.equal(formatted(cardNumber, '4242 42424|242'), '4242 4242 4|242');
});

test('a character the format drops leaves the caret where it was', () => {
  assert.equal(formatted(cardNumber, '4242a|'), '4242|');
  assert.equal(formatted(cardNumber, '42a|42'), '42|42');
});

test('deleting a separator the format puts back moves the caret before it', () => {
  assert.equal(formatted(cardNumber, '4242|4242'), '4242| 4242');
  assert.equal(formatted(amount, '$1|234'), '$1|,234');
});

test('an expiry gets its slash with the year, and loses it with the year', () => {
  assert.equal(formatted(expiry, '1|'), '1|');
  assert.equal(formatted(expiry, '123|'), '12/3|');
  assert.equal(formatted(expiry, '12/|'), '12|');
  assert.equal(formatted(expiry, '1|2/34'), '1|2/34');
  assert.equal(formatted(expiry, '12/345|'), '12/34|');
});

test('an amount regroups its thousands around the caret', () => {
  assert.equal(formatted(amount, '5|'), '$5|');
  assert.equal(formatted(amount, '$1,2345|'), '$12,345|');
  assert.equal(formatted(amount, '$1,29|34'), '$12,9|34');
  assert.equal(formatted(amount, '$1,29|34,567'), '$12,9|34,567');
  assert.equal(formatted(amount, '$12,345.678|'), '$12,345.67|');
  assert.equal(formatted(amount, '$|'), '|');
});

test('letters keep their place whatever their case', () => {
  const upper = (text: string) => text.toUpperCase();

  assert.equal(formatted(upper, 'ab|c'), 'AB|C');
  assert.equal(formatted(upper, 'abc|'), 'ABC|');
});

test('a caret among characters the format both drops and adds follows the last it kept', () => {
  const digits = (text: string) => text.replace(/\D/g, '').split('').join('-');

  assert.equal(formatted(digits, 'x1y|2z'), '1|-2');
  assert.equal(formatted(digits, 'xy|12'), '|1-2');
});

test('a selection maps both of its ends', () => {
  assert.equal(formatted(cardNumber, '4[2424]242'), '4[242 4]242');
});

test('the caret never splits a character made of two code units', () => {
  const doubled = (text: string) => text.replace(/!/g, '😀😀');

  assert.equal(formatted(doubled, 'a!|'), 'a😀😀|');
  assert.equal(formatted(doubled, 'a!|b'), 'a😀😀|b');
});

test('a text unchanged keeps its selection', () => {
  const same = (text: string) => text;

  assert.equal(formatted(same, 'he|llo'), 'he|llo');
  assert.equal(formatted(same, 'h[ell]o'), 'h[ell]o');
});

test('a format that returns no string is an error', () => {
  assert.throws(
    () => formatEdit(() => 42 as never, field('a|')),
    /format returned a number; it returns the text the field shows/,
  );
});
