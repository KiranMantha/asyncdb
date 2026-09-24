# asyncdb

A promisified, tree-shakable wrapper for IndexedDB, written in TypeScript.

It exposes two independent, tree-shakable APIs:

- **Database (Table) API** — structured, multi-store data with indices, for when your data has shape (rows, columns, relationships).
- **Key/Value API** — a flat, zero-config store for when you just need to save and load a value by key (settings, cached blobs, drafts).

Import only what you use — a bundler will drop the rest. If you only import `getItem`/`setItem`/`removeItem`, none of the table-related code ends up in your bundle, and vice versa.

```bash
npm install asyncdb
```

All functions return Promises and **reject** with an `Error` on failure — there's no `{status, data}` envelope to unwrap, just `await`/`.then()`/`.catch()` like any other async API.

---

## Database (Table) API

Use this when your data has structure: named tables (object stores), columns, and indices you want to query by.

### Setting up a database

```ts
import { setupDatabase } from 'asyncdb';

await setupDatabase({
  name: 'CustomersDB',
  version: 1,
  tables: [
    {
      name: 'customers',
      options: {
        primaryKeyColumn: 'id',
        autoIncrement: true,
      },
      indices: [
        {
          name: 'name',
          columns: ['name'],
          options: { unique: false },
        },
      ],
    },
  ],
});
```

- `name` / `version` — the IndexedDB database name and schema version.
- `tables` — an array of table definitions, each with:
  - `name` — the table (object store) name.
  - `options.primaryKeyColumn` — the column that uniquely identifies each row (maps to IndexedDB's `keyPath`).
  - `options.autoIncrement` — auto-generate the primary key on insert.
  - `indices` — secondary indices to query by, each with:
    - `name` — the index name, passed to `queryTable`/`queryTableCursor`.
    - `columns` — one column for a simple index, multiple for a compound index (e.g. `['lastName', 'firstName']`).
    - `options` — native `IDBIndexParameters` (e.g. `{ unique: true }`, `{ multiEntry: true }`).

`setupDatabase` only runs table/index creation logic when `version === 1` (a first-time setup). Schema migrations for later versions aren't handled automatically — call `setupDatabase` again with a higher version to trigger IndexedDB's own upgrade flow, and add your own migration logic as needed.

### Reading records

```ts
import { queryTable, queryTableCursor } from 'asyncdb';

// All records in a table
const customers = await queryTable({ table: 'customers' });

// Records matching an exact key
const single = await queryTable({ table: 'customers', query: 1 });

// Limit how many records come back
const firstTen = await queryTable({ table: 'customers', count: 10 });
```

`queryTableCursor` walks an index and supports range queries, ordering, and pagination. Say you have an `orders` table with an `amount` index:

```ts
await setupDatabase({
  name: 'OrdersDB',
  version: 1,
  tables: [
    {
      name: 'orders',
      options: { primaryKeyColumn: 'id', autoIncrement: true },
      indices: [{ name: 'amount', columns: ['amount'] }],
    },
  ],
});
```

```ts
// Everything, ordered by amount
const { results } = await queryTableCursor({ table: 'orders', index: 'amount' });

// Exact match on the index
const exactly500 = await queryTableCursor({ table: 'orders', index: 'amount', query: 500 });

// Range query — no IDBKeyRange needed
const midRange = await queryTableCursor({
  table: 'orders',
  index: 'amount',
  query: { gte: 300, lte: 1000 },     // inclusive: 300 <= amount <= 1000
});
const strictlyBetween = await queryTableCursor({
  table: 'orders',
  index: 'amount',
  query: { gt: 300, lt: 1000 },       // exclusive: 300 < amount < 1000
});
const highValue = await queryTableCursor({
  table: 'orders',
  index: 'amount',
  query: { gte: 1000 },               // open-ended: amount >= 1000
});

// Largest orders first
const highestFirst = await queryTableCursor({ table: 'orders', index: 'amount', direction: 'prev' });
```

`query` accepts either an exact value or a `{ gt?, gte?, lt?, lte? }` range object — this works for strings, numbers, and dates alike.

#### Pagination

Pass `count` to cap how many records come back, and use the returned `nextOffset` to fetch the next page:

```ts
const page1 = await queryTableCursor({ table: 'orders', index: 'amount', count: 50 });
console.log(page1.results);       // first 50 orders, ordered by amount
console.log(page1.nextOffset);    // { key, primaryKey } — or undefined if there's nothing more

const page2 = await queryTableCursor({
  table: 'orders',
  index: 'amount',
  count: 50,
  offset: page1.nextOffset,
});
```

`nextOffset` is `undefined` once you've reached the end — check for that to know when to stop paginating.

### Writing records

```ts
import { insertRecords, upsertTable } from 'asyncdb';

// Bulk-add new records (fails if a key already exists)
await insertRecords({ table: 'customers', data: [{ name: 'Alice' }, { name: 'Bob' }] });

// Put a single record (insert or overwrite)
await upsertTable({ table: 'customers', data: { id: 1, name: 'Alice Renamed' } });

// Put at an explicit key (for stores without an inline primaryKeyColumn)
await upsertTable({ table: 'customers', data: { name: 'Carol' }, key: 42 });

// upsertTable also accepts an array, behaving like insertRecords
await upsertTable({ table: 'customers', data: [{ name: 'Dave' }] });
```

`upsertTable` always writes the full record — it doesn't merge a partial patch into an existing one. To update just a few fields, read the record first and pass the merged object back in:

```ts
const [existing] = await queryTable({ table: 'customers', query: 1 });
await upsertTable({ table: 'customers', data: { ...existing, name: 'Updated Name' } });
```

### Deleting records and databases

```ts
import { deleteRecord, deleteDatabase } from 'asyncdb';

await deleteRecord({ table: 'customers', key: 1 });

// Deletes the whole database set up via setupDatabase
deleteDatabase();
```

### Introspection

```ts
import { getNativeDB, getDbName, getDbVersion } from 'asyncdb';

getNativeDB();    // the raw IDBDatabase handle, for anything asyncdb doesn't cover
getDbName();       // the name passed to setupDatabase
getDbVersion();    // the version passed to setupDatabase
```

---

## Key/Value API

Use this when you just need to save and load values by key — no schema, no `setupDatabase()` call required. The store initializes itself lazily on first use, backed by its own dedicated IndexedDB database.

```ts
import { getItem, setItem, removeItem } from 'asyncdb';

await setItem('theme', 'dark');
const theme = await getItem('theme');     // 'dark'
await removeItem('theme');
const cleared = await getItem('theme');   // undefined
```

- `getItem(key)` — resolves the stored value, or `undefined` if nothing is stored at that key.
- `setItem(key, value)` — stores (or overwrites) a value at a key. Values can be any structured-clonable data — objects, arrays, primitives.
- `removeItem(key)` — deletes the value at a key.

Keys are `IDBValidKey` — strings, numbers, dates, or arrays of those.

### Overriding the store's location

By default the KV store lives in a database named `asyncdb-kv`, in a store named `kv`. Override this **before** the first `getItem`/`setItem`/`removeItem` call:

```ts
import { configureKvStore } from 'asyncdb';

configureKvStore({ kvDbName: 'my-app-cache', kvStoreName: 'settings' });
```

Calling `configureKvStore` after the store has already initialized throws — set it once, early, before any KV read/write.

---

## Error handling

Every function returns a Promise that rejects with a real `Error` on failure — no status flags to check:

```ts
try {
  await setupDatabase({ name: 'CustomersDB', version: 1 });
} catch (err) {
  console.error('Failed to set up database:', err.message);
}
```

Calling a table function before `setupDatabase()` has resolved throws a clear error rather than an opaque runtime crash:

```ts
await queryTable({ table: 'customers' });
// Error: Database is not set up yet. Call setupDatabase() first.
```

---

## Full example

See [`example/`](./example) for a working demo combining both APIs — a customer list backed by the table API, and a notes field backed by the key/value API, running on the same page.
