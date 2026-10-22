// The Components panel's page (docs/devtools.md): Kuito's binding graph,
// signal → binding → view, from the kernel's backend (src/runtime/devtools.ts)
// through the dev server's inspector proxy.
import type { KernelMessage, PanelMessage } from '../../runtime/devtools-protocol';
import { render, type Hands } from './render';
import { initialState, inspections, reduce, type Action } from './store';

/** While the page is open, the selection's values are asked for again this often. */
const REFRESH_MS = 1000;

const page = document.body.dataset.page ?? '';
const root = document.getElementById('panel');
const socket = new WebSocket(
  // The page's own query carries the session token the socket must send.
  `ws://${location.host}/inspector/components/${encodeURIComponent(page)}${location.search}`,
);
let state = initialState;

function send(message: PanelMessage) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

const hands: Hands = {
  select(selection) {
    dispatch({ type: 'select', selection });
    inspections(state).forEach(send);
  },
  send(message) {
    send(message);
    // An edit shows at once.
    if (message.event.startsWith('set')) inspections(state).forEach(send);
  },
  history(on) {
    dispatch({ type: 'history', on });
    inspections(state).forEach(send);
  },
  inspect(on) {
    dispatch({ type: 'inspecting', on });
    send({ event: on ? 'startInspecting' : 'stopInspecting' });
  },
  invalid(text) {
    dispatch({ type: 'status', text: `Not JSON: ${text}. Strings need quotes.` });
  },
};

/** The panes that scroll, which keep their place when the page is drawn again. */
const SCROLLING = ['nav', '.details'];

function draw() {
  // Typing in a value's editor is not interrupted; the page catches up after.
  if (!root || document.activeElement instanceof HTMLInputElement) return;

  const scrolled = SCROLLING.map((selector) => root.querySelector(selector)?.scrollTop ?? 0);

  root.replaceChildren(...render(state, hands));

  SCROLLING.forEach((selector, index) => {
    const pane = root.querySelector(selector);

    if (pane) pane.scrollTop = scrolled[index] ?? 0;
  });
}

function dispatch(action: Action) {
  const next = reduce(state, action);
  // The refresh mostly brings what the page shows: drawing it again would drop a click in flight.
  const same = JSON.stringify(next) === JSON.stringify(state);

  state = next;
  if (!same) draw();
}

function connect() {
  dispatch({ type: 'reset' });
  send({ event: 'connect' });
  inspections(state).forEach(send);
}

socket.addEventListener('open', connect);
draw();

socket.addEventListener('message', ({ data }) => {
  const message: KernelMessage = JSON.parse(String(data));

  // A new runtime on the device (a reload): it knows nothing of this panel yet.
  if (message.event === 'hello') return connect();

  dispatch({ type: 'received', message });

  if (message.event === 'tree' || message.event === 'selected') inspections(state).forEach(send);
});

socket.addEventListener('close', ({ reason }) =>
  dispatch({
    type: 'status',
    text: `${reason || 'The app disconnected'}. Press k in kuito dev to open the panel again.`,
  }),
);

document.addEventListener('focusout', draw);

setInterval(() => {
  if (!document.hidden) inspections(state).forEach(send);
}, REFRESH_MS);
