// Persist each batch of positions delivered to a background location task.
import { location, storage } from 'kuito';

location.defineUpdates('trip', async (run: location.LocationTaskRun) => {
  await storage.set('latest-trip-batch', JSON.stringify(run.locations));
});
// Register at module scope. Declare background location and obtain permission
// before calling location.startUpdates('trip').
