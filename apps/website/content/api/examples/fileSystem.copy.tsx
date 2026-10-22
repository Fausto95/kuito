import { fileSystem } from 'kuito';

await fileSystem.copy(fileSystem.bundle + 'seed.db', fileSystem.documents + 'app.db');
