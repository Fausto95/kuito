// Move a temporary file to documents.
import { fileSystem } from 'kuito';

await fileSystem.move(fileSystem.cache + 'report.tmp', fileSystem.documents + 'report.pdf');
