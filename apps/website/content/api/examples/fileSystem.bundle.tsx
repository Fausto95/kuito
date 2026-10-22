// Read a packaged file.
import { fileSystem } from 'kuito';

const seed = await fileSystem.read(fileSystem.bundle + 'seed.json'); // read-only
