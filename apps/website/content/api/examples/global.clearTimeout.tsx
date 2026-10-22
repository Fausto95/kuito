const reminder = setTimeout(() => console.log('Still there?'), 30_000);

// The user came back first: the reminder never shows.
clearTimeout(reminder);
