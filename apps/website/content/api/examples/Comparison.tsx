// Reuse a filter when querying a typed table.
import { db, type Comparison, type Table } from 'kuito';

type Product = { id: string; price: number };
export function affordableProducts(products: Table<Product>) {
  const price: Comparison<number> = { gte: 0, lte: 50 };
  return db.query(products, { where: { price }, orderBy: { price: 'asc' } });
}
