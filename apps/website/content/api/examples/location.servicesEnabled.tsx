// Check device-wide location services.
import { location } from 'kuito';

if (!(await location.servicesEnabled())) console.log('Location services are off');
