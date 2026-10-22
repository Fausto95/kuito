// Decode a UTF-8 file returned as bytes.
import { fileSystem } from 'kuito';

const bytes = await fileSystem.readBytes(fileSystem.documents + 'notes.txt');
const text = new TextDecoder().decode(bytes);
console.log(text);
