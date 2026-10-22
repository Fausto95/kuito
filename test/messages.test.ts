import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { formatMessage, pickLocale, translator } from '../src/native/intl/messages.ts';

// localization.messages: ICU MessageFormat's arguments, plural, selectordinal
// and select, in the catalog of the user's best language.

test('arguments format by type and locale', () => {
  assert.equal(formatMessage('Hello, {name}!', { name: 'Ada' }, 'en'), 'Hello, Ada!');
  assert.equal(formatMessage('{n} views', { n: 1234.5 }, 'de'), '1.234,5 views');

  assert.equal(
    formatMessage('On {day}', { day: new Date(Date.UTC(2026, 9, 20, 12)) }, 'en-US'),
    `On ${new Intl.DateTimeFormat('en-US').format(new Date(Date.UTC(2026, 9, 20, 12)))}`,
  );

  assert.throws(() => formatMessage('Hi {name}', {}, 'en'), {
    name: 'TypeError',
    message: /"Hi \{name\}" needs a value for name/,
  });
});

test('plural, selectordinal and select pick a branch; # is the number', () => {
  const inbox = '{count, plural, =0 {No messages} one {# message} other {# messages}}';

  assert.equal(formatMessage(inbox, { count: 0 }, 'en'), 'No messages');
  assert.equal(formatMessage(inbox, { count: 1 }, 'en'), '1 message');
  assert.equal(formatMessage(inbox, { count: 1000 }, 'en'), '1,000 messages');

  const files = '{n, plural, one {# ficheiro} many {# de ficheiros} other {# ficheiros}}';

  assert.equal(
    formatMessage(files, { n: 1000000 }, 'fr'),
    `${new Intl.NumberFormat('fr').format(1000000)} de ficheiros`,
    'French has a many category for millions',
  );

  const place = '{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}';

  assert.deepEqual(
    [1, 2, 3, 4, 11, 22].map((n) => formatMessage(place, { n }, 'en')),
    ['1st', '2nd', '3rd', '4th', '11th', '22nd'],
  );

  const liked =
    '{who, select, she {She liked {n, plural, one {a post} other {# posts}}} other {They liked it}}';

  assert.equal(formatMessage(liked, { who: 'she', n: 2 }, 'en'), 'She liked 2 posts');
  assert.equal(formatMessage(liked, { who: 'we', n: 2 }, 'en'), 'They liked it');

  const nested = '{n, plural, other {{who, select, me {#1 me, # times} other {#}}}}';

  assert.equal(
    formatMessage(nested, { n: 3, who: 'me' }, 'en'),
    '#1 me, # times',
    'a select inside a plural keeps # as text, as ICU does',
  );

  assert.equal(
    formatMessage('{n, plural, =-1 {minus one} =1.0 {exactly one} other {#}}', { n: 1 }, 'en'),
    'exactly one',
  );

  assert.equal(
    formatMessage('{n, plural, =-1 {minus one} other {#}}', { n: -1 }, 'en'),
    'minus one',
  );
});

test('apostrophes quote braces, and malformed messages throw', () => {
  assert.equal(
    formatMessage("It''s '{'literal'}' and ''{x}''", { x: 1 }, 'en'),
    "It's {literal} and '1'",
  );

  assert.equal(formatMessage("{n, plural, other {'#' is #}}", { n: 3 }, 'en'), '# is 3');
  assert.throws(() => formatMessage('Hi {name', { name: 'a' }, 'en'), SyntaxError);

  assert.throws(() => formatMessage('{n, plural, one {x}}', { n: 1 }, 'en'), {
    name: 'SyntaxError',
    message: /plural needs an other branch/,
  });

  assert.throws(() => formatMessage('{n, number}', { n: 1 }, 'en'), SyntaxError);

  assert.throws(() => formatMessage('{n, plural, one {a} one {b} other {c}}', { n: 1 }, 'en'), {
    message: /two one branches/,
  });

  assert.throws(() => formatMessage('{n, plural, other {a}', { n: 1 }, 'en'), {
    message: /needs a \} to close its plural/,
  });
});

test('the best catalog is the first preferred language one matches', () => {
  const catalogs = ['en', 'pt', 'pt-PT', 'zh-Hant'];

  assert.equal(pickLocale(['pt-BR', 'en-US'], catalogs), 'pt');
  assert.equal(pickLocale(['pt-PT'], catalogs), 'pt-PT');
  assert.equal(pickLocale(['zh-Hant-TW'], catalogs), 'zh-Hant');
  assert.equal(pickLocale(['de-DE', 'en-GB'], catalogs), 'en');
  assert.equal(pickLocale(['de'], catalogs), 'en', 'the first catalog when none matches');
});

test('a translator follows the preferred languages and falls back key by key', () => {
  let preferred = ['pt-PT'];
  const t = translator(
    {
      en: { hello: 'Hello, {name}', bye: 'Bye', only: 'Only in English', on: 'On {day}' },
      pt: { hello: 'Olá, {name}', bye: 'Adeus' },
      'pt-PT': { hello: 'Olá, {name}!' },
    },
    () => preferred,
  );

  assert.equal(t('hello', { name: 'Rita' }), 'Olá, Rita!');
  assert.equal(t('bye'), 'Adeus', 'a key pt-PT lacks comes from pt');
  assert.equal(t('only'), 'Only in English', 'one no Portuguese catalog has, from the first');

  preferred = ['pt-BR'];
  assert.equal(t('bye'), 'Adeus');
  preferred = ['ja'];
  assert.equal(t('hello', { name: 'Kenji' }), 'Hello, Kenji');

  const day = new Date(Date.UTC(2026, 9, 20, 12));

  preferred = ['en-GB'];

  assert.equal(
    t('on', { day }),
    `On ${new Intl.DateTimeFormat('en-GB').format(day)}`,
    'the en catalog formats for the user’s en-GB',
  );
});
