import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { createSourceCompiler } from '../src/dev/compiler.ts';
import { fakeModules } from './support/fake-modules.ts';
import { installKernel } from './support/kuito-host.ts';
import { hosting } from './support/host-wire.ts';

// alert(), prompt() and actionSheet() as an app calls them, against a fake
// platform that answers with the button the user picked.

interface Button {
  text?: string;
  style?: string;
  preferred?: boolean;
  disabled?: boolean;
}

interface Apis {
  alert(options: object): Promise<Button | null>;
  prompt(options: object): Promise<{ button: Button; value: unknown } | null>;
  actionSheet(options: object): Promise<Button | null>;
}

/** Values from the kernel's realm, comparable with this one's. */
const data = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

const tick = () => new Promise<void>((done) => setTimeout(done, 0));

async function compile(entry: string) {
  const temp = mkdtempSync(join(tmpdir(), 'kuito-dialogs-'));

  try {
    return (await createSourceCompiler({ platform: 'ios', outputDir: temp })(resolve(entry))).code;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

const code = compile('test/fixtures/dialogs-app.tsx');

/** A platform whose user answers every dialog with `answer`. */
async function dialogs(answer: () => unknown) {
  const native = fakeModules({
    Alert: { functions: { alert: { thread: 'main', run: answer } } },
    ActionSheet: { functions: { show: { thread: 'main', run: answer } } },
  });
  const kernel = installKernel(
    hosting({
      createView() {},
      setProp() {},
      removeView() {},
      ...native.host,
    }),
  );

  native.attach(kernel);
  runInNewContext(await code, kernel);

  /** Shows the queued dialogs, answers them, then lets the callbacks run. */
  const answerAll = async () => {
    native.flush();
    await tick();
  };

  const apis = kernel as unknown as Apis;

  return {
    ...native,
    alert: (options: object) => apis.alert(options),
    prompt: (options: object) => apis.prompt(options),
    actionSheet: (options: object) => apis.actionSheet(options),
    answerAll,
  };
}

const request = (app: { calls: { args: unknown[] }[] }) => data(app.calls[0].args[0]);

test('alert() shows one OK button by default and resolves it', async () => {
  const app = await dialogs(() => ({ index: 0 }));
  const picked = app.alert({ title: 'Saved' });

  await app.answerAll();
  assert.deepEqual(data(await picked), { text: 'OK' });

  assert.deepEqual(request(app), {
    title: 'Saved',
    message: null,
    buttons: [{ text: 'OK', style: 'default', preferred: false }],
    cancelable: false,
    userInterfaceStyle: 'unspecified',
    prompt: null,
  });
});

test('alert() resolves with the button the user picked, the same object', async () => {
  const remove = { text: 'Delete', style: 'destructive' };
  const app = await dialogs(() => ({ index: 1 }));
  const picked = app.alert({
    title: 'Delete show?',
    message: 'It leaves your library.',
    buttons: [{ text: 'Cancel', style: 'cancel' }, remove, { text: 'Archive', preferred: true }],
    cancelable: true,
    colorScheme: 'dark',
  });

  await app.answerAll();
  assert.equal(await picked, remove);

  assert.deepEqual(request(app), {
    title: 'Delete show?',
    message: 'It leaves your library.',
    buttons: [
      { text: 'Cancel', style: 'cancel', preferred: false },
      { text: 'Delete', style: 'destructive', preferred: false },
      { text: 'Archive', style: 'default', preferred: true },
    ],
    cancelable: true,
    userInterfaceStyle: 'dark',
    prompt: null,
  });
});

test('dismissing an alert without a button resolves null', async () => {
  const app = await dialogs(() => ({ index: null }));
  const picked = app.alert({ title: 'Offline', cancelable: true });

  await app.answerAll();
  assert.equal(await picked, null);
});

test('an alert takes at most one cancel button, before anything crosses', async () => {
  const app = await dialogs(() => ({ index: 0 }));

  await assert.rejects(
    app.alert({
      title: 'Leave?',
      buttons: [
        { text: 'No', style: 'cancel' },
        { text: 'Never', style: 'cancel' },
      ],
    }),
    { name: 'TypeError', message: /alert\(\) takes at most one button with style "cancel"/ },
  );

  await app.answerAll();
  assert.deepEqual(app.calls, []);
});

test('prompt() shows Cancel and OK and resolves the button with the text', async () => {
  const app = await dialogs(() => ({ index: 1, text: 'Ada' }));
  const answered = app.prompt({ title: 'Your name', message: 'Shown on your profile' });

  await app.answerAll();
  assert.deepEqual(data(await answered), { button: { text: 'OK' }, value: 'Ada' });

  assert.deepEqual(request(app), {
    title: 'Your name',
    message: 'Shown on your profile',
    buttons: [
      { text: 'Cancel', style: 'cancel', preferred: false },
      { text: 'OK', style: 'default', preferred: false },
    ],
    cancelable: false,
    userInterfaceStyle: 'unspecified',
    prompt: { type: 'text', value: '', inputMode: 'text' },
  });
});

test('cancelling a prompt resolves the cancel button', async () => {
  const app = await dialogs(() => ({ index: 0, text: 'Ada' }));
  const answered = app.prompt({ title: 'Your name' });

  await app.answerAll();

  assert.deepEqual(data(await answered), {
    button: { text: 'Cancel', style: 'cancel' },
    value: 'Ada',
  });
});

test('a login prompt resolves the username and the password', async () => {
  const signIn = { text: 'Sign in' };
  const app = await dialogs(() => ({ index: 1, text: 'ada', password: 'hunter2' }));
  const answered = app.prompt({
    title: 'Sign in',
    buttons: [{ text: 'Cancel', style: 'cancel' }, signIn],
    type: 'login',
    value: 'ada',
    inputMode: 'email',
  });

  await app.answerAll();

  const answer = await answered;

  assert.equal(answer?.button, signIn);
  assert.deepEqual(data(answer?.value), { username: 'ada', password: 'hunter2' });

  assert.deepEqual((request(app) as { prompt: unknown }).prompt, {
    type: 'login',
    value: 'ada',
    inputMode: 'email',
  });
});

test('a password prompt takes a numeric keyboard, for a PIN', async () => {
  const app = await dialogs(() => ({ index: 1, text: '1234' }));
  const answered = app.prompt({ title: 'PIN', type: 'password', inputMode: 'numeric' });

  await app.answerAll();
  assert.equal((await answered)?.value, '1234');

  assert.deepEqual((request(app) as { prompt: unknown }).prompt, {
    type: 'password',
    value: '',
    inputMode: 'numeric',
  });
});

test('actionSheet() resolves with the button the user picked, the same object', async () => {
  const archive = { text: 'Archive' };
  const app = await dialogs(() => ({ index: 2 }));

  const picked = app.actionSheet({
    buttons: [
      { text: 'Share' },
      { text: 'Delete', style: 'destructive' },
      archive,
      { text: 'Report', disabled: true },
      { text: 'Cancel', style: 'cancel' },
    ],
    title: 'Episode 4',
    message: 'Choose what to do',
    anchor: { x: 40, y: 300 },
    colorScheme: 'light',
  });

  await app.answerAll();
  assert.equal(await picked, archive);

  assert.deepEqual(request(app), {
    options: ['Share', 'Delete', 'Archive', 'Report', 'Cancel'],
    title: 'Episode 4',
    message: 'Choose what to do',
    cancelButtonIndex: 4,
    destructiveButtonIndices: [1],
    disabledButtonIndices: [3],
    tintColor: null,
    anchor: { x: 40, y: 300 },
    userInterfaceStyle: 'light',
  });
});

test('dismissing an action sheet resolves its cancel button, or null without one', async () => {
  const cancel = { text: 'Cancel', style: 'cancel' };
  const app = await dialogs(() => ({ index: null }));

  const cancelled = app.actionSheet({ buttons: [{ text: 'Copy' }, cancel] });
  const dismissed = app.actionSheet({ buttons: [{ text: 'Copy' }, { text: 'Paste' }] });

  await app.answerAll();
  assert.equal(await cancelled, cancel);
  assert.equal(await dismissed, null);
});

test('an action sheet without buttons or with two cancels fails before anything crosses', async () => {
  const app = await dialogs(() => ({ index: 0 }));

  await assert.rejects(app.actionSheet({ buttons: [] }), {
    name: 'TypeError',
    message: /actionSheet\(\) needs at least one button/,
  });

  await assert.rejects(
    app.actionSheet({
      buttons: [
        { text: 'No', style: 'cancel' },
        { text: 'Never', style: 'cancel' },
      ],
    }),
    { name: 'TypeError', message: /actionSheet\(\) takes at most one button with style "cancel"/ },
  );

  await app.answerAll();
  assert.deepEqual(app.calls, []);
});
