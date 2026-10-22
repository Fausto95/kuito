// Measure an operation without relying on wall-clock changes.
const start = performance.now();
const response = await fetch('https://example.com/api/health');
console.log(response.status, performance.now() - start);
