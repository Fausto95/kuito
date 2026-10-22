// Check whether background execution is allowed.
import { backgroundTasks } from 'kuito';

const status = await backgroundTasks.status(); // 'available' | 'denied' | 'restricted'
