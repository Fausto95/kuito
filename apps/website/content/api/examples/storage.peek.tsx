// Read one small startup value synchronously.
import { storage } from 'kuito';

const lastAccount = storage.peek('account.last');
console.log(lastAccount ?? 'Choose an account');
