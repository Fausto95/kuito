import { fileSystem } from 'kuito';

const names = await fileSystem.list(fileSystem.documents); // ['app.db', 'photos']
