// Copy plain application data before editing a draft.
const saved = { title: 'Packing list', items: ['Passport'] };
const draft = structuredClone(saved);
draft.items.push('Tickets');
console.log(saved.items.length, draft.items.length); // 1, 2
