// Find coordinates for an address.
import { location } from 'kuito';

const matches = await location.geocode('1 Infinite Loop, Cupertino');

matches[0]?.latitude; // 37.33, or [] with no match
