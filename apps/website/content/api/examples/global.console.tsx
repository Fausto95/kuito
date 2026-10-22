console.log('Loaded', 3, 'items');
console.warn('Cache is stale');
console.error(new Error('Sync failed')); // reaches the LogBox and `kuito dev`
