// Describe a parameterized statement for a SQL integration.
import type { storage } from 'kuito';

export function noteInsert(id: string, body: string): storage.SqlStatement {
  const params: storage.SqlValue[] = [id, body];
  return { sql: 'INSERT INTO notes (id, body) VALUES (?, ?)', params };
}
// These are data types, not a public raw-SQL executor. App writes use db.table().
