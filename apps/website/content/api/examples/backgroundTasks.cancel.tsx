// Disable a scheduled background task.
import { backgroundTasks } from 'kuito';

await backgroundTasks.cancel('sync');
