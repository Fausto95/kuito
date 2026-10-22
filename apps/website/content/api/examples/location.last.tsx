// Use a recent cached position.
import { location } from 'kuito';

const fix = await location.last({ maxAge: 60_000, requiredAccuracy: 100 });

if (fix) console.log(fix.coords.latitude, fix.coords.longitude); // null without a fresh enough fix
