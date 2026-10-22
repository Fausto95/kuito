// Defer a small follow-up until the current synchronous work finishes.
const events: string[] = [];
queueMicrotask(() => console.log(events.join(', ')));
events.push('saved');
events.push('closed');
