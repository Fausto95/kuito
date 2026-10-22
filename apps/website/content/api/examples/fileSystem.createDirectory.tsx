// Create a directory for downloads.
import { fileSystem } from 'kuito';

await fileSystem.createDirectory(fileSystem.documents + 'photos/2026/', { intermediates: true });
