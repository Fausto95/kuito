import { createElement as h, Fragment, useState } from 'react';
import { Box, Static, Text, useAnimation, useInput, useWindowSize } from 'ink';
import { useStore } from 'zustand';
import {
  columnTitle,
  describeDevice,
  describeItem,
  pickerWindow,
  SHORTCUTS,
  shortcutAction,
} from './format.ts';
import { filterDevices } from '../devices.ts';
import type { Device } from '../devices.ts';
import type { RouteStyle } from '../config.ts';
import type { ShortcutAction, Tone } from './format.ts';
import type { FeedItem, LinkedDevice, RunningStep as Step } from './state.ts';
import type { SessionStore } from './store.ts';

export type SessionActions = Record<ShortcutAction, () => void> & {
  select: (device: Device) => void;
  cancelPick: () => void;
};

// Named ANSI colours follow the user's terminal theme; dim is the only grey.
const TONES: Record<Tone, { color?: string; dimColor?: boolean }> = {
  success: { color: 'green' },
  error: { color: 'red' },
  warning: { color: 'yellow' },
  accent: { color: 'cyan' },
  muted: { dimColor: true },
  normal: {},
};
const SPINNER = ['◐', '◓', '◑', '◒'];
const SPACE_BEFORE = new Set(['live']);
const SPACE_AFTER = new Set(['title', 'live']);

function FeedItem({ item, cwd, entry }: { item: FeedItem; cwd: string; entry: string }) {
  const { time, icon, tone, title, subject, meta, detail } = describeItem(item, { cwd, entry });
  const indent = ' '.repeat(time ? 12 : 4);

  return h(
    Box,
    {
      flexDirection: 'column',
      marginTop: SPACE_BEFORE.has(item.kind) ? 1 : 0,
      marginBottom: SPACE_AFTER.has(item.kind) ? 1 : 0,
    },
    h(
      Text,
      null,
      time && h(Text, { dimColor: true }, `${time}  `),
      h(Text, TONES[tone], icon),
      ' ',
      h(
        Text,
        { bold: item.kind === 'title', ...(tone === 'muted' && TONES.muted) },
        columnTitle(item, title),
      ),
      subject && `  ${subject}`,
      meta && h(Text, { dimColor: true }, `  ${meta}`),
    ),
    detail.map((line, index) =>
      h(Text, { key: index, ...TONES[line.tone ?? 'normal'] }, indent + line.text),
    ),
  );
}

function RunningStep({ label, detail }: Step) {
  const { frame } = useAnimation({ interval: 90 });

  return h(
    Text,
    null,
    h(Text, TONES.accent, SPINNER[frame % SPINNER.length]),
    ' ',
    label,
    detail && h(Text, { dimColor: true }, `  ${detail}`),
  );
}

function DeviceLine({ linked }: { linked: LinkedDevice }) {
  const { icon, tone, title, state } = describeDevice(linked);

  return h(
    Text,
    null,
    h(Text, TONES[tone], icon),
    ' ',
    title,
    h(Text, { dimColor: true }, `  ${state}`),
  );
}

function Help() {
  return h(
    Box,
    { flexDirection: 'column', marginTop: 1 },
    h(Text, { bold: true }, 'Shortcuts'),
    SHORTCUTS.map(({ key, help }) =>
      h(Text, { key }, '  ', h(Text, { bold: true }, key.padEnd(3)), help),
    ),
  );
}

function ShortcutBar({ logs }: { logs: boolean }) {
  const { columns } = useWindowSize();
  const visible = SHORTCUTS.filter((shortcut) => !shortcut.hidden);

  return h(
    Box,
    { flexDirection: 'column', marginTop: 1 },
    h(Text, { dimColor: true }, '─'.repeat(Math.max(10, Math.min(columns - 2, 64)))),
    h(
      Text,
      null,
      ' ',
      visible.map(({ key, label }, index) =>
        h(
          Fragment,
          { key },
          index > 0 && h(Text, { dimColor: true }, ' · '),
          h(Text, { bold: true }, key),
          ' ',
          h(Text, { dimColor: true }, key === 'l' && logs ? 'logs on' : label),
        ),
      ),
    ),
  );
}

/** `actions` maps every shortcut action name to a function supplied by the controller. */
export function SessionView({
  store,
  actions,
  cwd,
}: {
  store: SessionStore;
  actions: SessionActions;
  cwd: string;
}) {
  const feed = useStore(store, (state) => state.feed);
  const epoch = useStore(store, (state) => state.epoch);
  const entry = useStore(store, (state) => state.entry);
  const running = useStore(store, (state) => state.running);
  const devices = useStore(store, (state) => state.devices);
  const help = useStore(store, (state) => state.help);
  const logs = useStore(store, (state) => state.logs);
  const picker = useStore(store, (state) => state.picker);
  const stopped = useStore(store, (state) => state.stopped);

  useInput(
    (input, key) => {
      if (key.ctrl && input === 'c') return actions.quit();

      const action = shortcutAction(input);

      if (action) actions[action]();
    },
    { isActive: !picker && !stopped },
  );

  return h(
    Fragment,
    null,
    h(Static<FeedItem>, {
      key: epoch,
      items: feed,
      children: (item) => h(FeedItem, { key: item.id, item, cwd, entry }),
    }),
    running.map((step) => h(RunningStep, { key: step.id, ...step })),
    devices.map((linked) => h(DeviceLine, { key: linked.device.id, linked })),
    picker &&
      h(DevicePicker, { ...picker, onSelect: actions.select, onCancel: actions.cancelPick }),
    !picker && !stopped && h(Fragment, null, help && h(Help), h(ShortcutBar, { logs })),
  );
}

function DeviceRow({
  device,
  selected,
  width,
}: {
  device: Device;
  selected: boolean;
  width: number;
}) {
  return h(
    Text,
    null,
    h(Text, TONES.accent, selected ? '❯ ' : '  '),
    h(Text, { bold: selected }, device.name.padEnd(width)),
    h(Text, { dimColor: true }, `  ${device.detail ?? ''}`),
    device.active && h(Text, TONES.success, '  ● booted'),
  );
}

export function DevicePicker({
  devices,
  onSelect,
  onCancel,
  message = 'Where should Kuito run?',
}: {
  devices: Device[];
  onSelect: (device: Device) => void;
  onCancel: () => void;
  message?: string;
}) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const { rows } = useWindowSize();
  const matches = filterDevices(devices, query);
  const selected = Math.min(index, Math.max(0, matches.length - 1));
  const edit = (next: string) => {
    setQuery(next);
    setIndex(0);
  };

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === 'c')) return onCancel();
    if (key.return) return matches[selected] && onSelect(matches[selected]);

    if (key.upArrow && matches.length)
      return setIndex((selected - 1 + matches.length) % matches.length);

    if (key.downArrow && matches.length) return setIndex((selected + 1) % matches.length);
    if (key.backspace || key.delete) return edit(query.slice(0, -1));
    if (input && !key.ctrl && !key.meta) edit(query + input);
  });

  const { start, end } = pickerWindow({ length: matches.length, index: selected, rows: rows - 4 });
  const shown = matches.slice(start, end);
  const width = Math.max(0, ...shown.map((device) => device.name.length));

  return h(
    Box,
    { flexDirection: 'column', marginTop: 1 },
    h(
      Text,
      null,
      h(Text, TONES.accent, '◆ '),
      h(Text, { bold: true }, message),
      h(Text, { dimColor: true }, '  type to filter · ↑↓ · enter · esc'),
    ),
    h(Text, null, h(Text, TONES.accent, '› '), query, h(Text, { inverse: true }, ' ')),
    shown.length
      ? shown.map((device, offset) =>
          h(DeviceRow, { key: device.id, device, width, selected: start + offset === selected }),
        )
      : h(Text, { dimColor: true }, `  No device matches “${query}”`),
    matches.length > shown.length &&
      h(Text, { dimColor: true }, `  ${selected + 1} of ${matches.length}`),
  );
}

/** The routing styles `kuito create` offers, as its picker lists them. */
const ROUTE_CHOICES: ReadonlyArray<{ style: RouteStyle; label: string; detail: string }> = [
  { style: 'files', label: 'File routes', detail: 'an app/ directory: each file is a route' },
  { style: 'components', label: 'Component routes', detail: 'one <Router> in app.tsx' },
];

export function RoutesPicker({
  name,
  onSelect,
  onCancel,
}: {
  name: string;
  onSelect: (style: RouteStyle) => void;
  onCancel: () => void;
}) {
  const [index, setIndex] = useState(0);
  const count = ROUTE_CHOICES.length;

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === 'c')) return onCancel();
    if (key.return) return onSelect(ROUTE_CHOICES[index].style);
    if (key.upArrow) return setIndex((index - 1 + count) % count);
    if (key.downArrow) setIndex((index + 1) % count);
  });

  const width = Math.max(...ROUTE_CHOICES.map((choice) => choice.label.length));

  return h(
    Box,
    { flexDirection: 'column', marginTop: 1 },
    h(
      Text,
      null,
      h(Text, TONES.accent, '◆ '),
      h(Text, { bold: true }, `How should ${name} route?`),
      h(Text, { dimColor: true }, '  ↑↓ · enter · esc'),
    ),
    ROUTE_CHOICES.map((choice, offset) =>
      h(
        Text,
        { key: choice.style },
        offset === index ? h(Text, TONES.accent, '› ') : '  ',
        h(Text, { bold: offset === index }, choice.label.padEnd(width)),
        h(Text, { dimColor: true }, '  ' + choice.detail),
      ),
    ),
  );
}
