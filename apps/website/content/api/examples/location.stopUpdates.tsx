// Stop a previously registered background tracking task.
import { location } from 'kuito';

if (await location.updating('trip-tracking')) {
  await location.stopUpdates('trip-tracking');
}
console.log(location.error.value);
