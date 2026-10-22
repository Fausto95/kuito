// Gives up after five seconds; `reason` says why it stopped.
const signal = AbortSignal.timeout(5000);

try {
  const response = await fetch('https://api.example.com/items', { signal });

  console.log(await response.json());
} catch (error) {
  if (signal.aborted) console.log('Timed out:', signal.reason);
  else throw error;
}
