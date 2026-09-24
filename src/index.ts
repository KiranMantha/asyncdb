export type TableIndex = {
    name: string;
    columns: string[];
    options?: IDBIndexParameters;
}

export type TableStoreOptions = {
    primaryKeyColumn?: string;
    autoIncrement?: boolean;
}

export type TableDefinition = {
    name: string;
    options?: TableStoreOptions;
    indices?: TableIndex[];
}

export type KvOptions = {
    kvDbName?: string;
    kvStoreName?: string;
}

export type SetupDatabaseOptions = {
    name: string;
    version: number;
    tables?: TableDefinition[];
}

export type TableQueryRange = {
    gt?: IDBValidKey;
    gte?: IDBValidKey;
    lt?: IDBValidKey;
    lte?: IDBValidKey;
}

export type TableQuery = IDBValidKey | TableQueryRange;

export type QueryTableOptions = {
    table: string;
    query?: TableQuery;
    count?: number;
}

export type QueryTableCursorOffset = {
    key: IDBValidKey;
    primaryKey: IDBValidKey;
}

export type QueryTableCursorOptions = {
    table: string;
    index: string;
    query?: TableQuery;
    direction?: IDBCursorDirection;
    count?: number;
    offset?: QueryTableCursorOffset;
}

export type QueryTableCursorResult<T> = {
    results: T[];
    nextOffset: QueryTableCursorOffset | undefined;
}

export type UpsertTableOptions<T> = {
    table: string;
    data: T | T[];
    key?: IDBValidKey;
}

export type InsertRecordsOptions<T> = {
    table: string;
    data?: T[];
}

export type DeleteRecordOptions = {
    table: string;
    key: IDBValidKey;
}

type Resolver<T> = (value: T) => void;
type Rejecter = (reason: Error) => void;

const DEFAULT_KV_DB_NAME = 'asyncdb-kv';
const DEFAULT_KV_STORE_NAME = 'kv';
const KV_VERSION = 1;

function createGenerator<T>(array: T[]): Generator<T, void, unknown> {
    function* gen() {
        yield* array;
    }
    return gen();
}

function promisify<T>(): [Promise<T>, Resolver<T>, Rejecter] {
    let resolver!: Resolver<T>;
    let rejecter!: Rejecter;
    const promise = new Promise<T>((resolve, reject) => {
        resolver = resolve;
        rejecter = reject;
    });
    return [promise, resolver, rejecter];
}

function toError(context: string, e: unknown): Error {
    if (e instanceof Error) return e;
    const target = (e as Event | undefined)?.target as IDBRequest | IDBTransaction | undefined;
    const domError = (target as IDBRequest)?.error ?? (target as IDBTransaction)?.error;
    return new Error(`${context}: ${domError?.message ?? 'unknown error'}`, { cause: domError ?? e });
}

function isTableQueryRange(query: TableQuery): query is TableQueryRange {
    return typeof query === 'object' && query !== null && !(query instanceof Date) && !Array.isArray(query);
}

function toKeyRange(query: TableQuery | undefined): IDBValidKey | IDBKeyRange | undefined {
    if (query === undefined || !isTableQueryRange(query)) {
        return query;
    }
    const { gt, gte, lt, lte } = query;
    const lower = gte ?? gt;
    const upper = lte ?? lt;
    if (lower !== undefined && upper !== undefined) {
        return IDBKeyRange.bound(lower, upper, gte === undefined, lte === undefined);
    }
    if (lower !== undefined) {
        return IDBKeyRange.lowerBound(lower, gte === undefined);
    }
    if (upper !== undefined) {
        return IDBKeyRange.upperBound(upper, lte === undefined);
    }
    return undefined;
}

function getIdb(): IDBFactory {
    const idb = window.indexedDB;
    if (!idb) {
        throw Error("Your browser doesn't support a stable version of IndexedDB.");
    }
    return idb;
}

// --- Table (structured, multi-store) API ---------------------------------

let db: IDBDatabase | undefined;
let currentDbName: string | undefined;
let currentVersion: number | undefined;

function requireDb(): IDBDatabase {
    if (!db) {
        throw new Error('Database is not set up yet. Call setupDatabase() first.');
    }
    return db;
}

function createIndex(objStore: IDBObjectStore, index: TableIndex): void {
    const [firstColumn] = index.columns ?? [];
    if (index.name && firstColumn) {
        const keyPath = index.columns.length === 1 ? firstColumn : index.columns;
        objStore.createIndex(index.name, keyPath, index.options || {});
    } else {
        throw Error('createIndex requires name and at least one column');
    }
}

function toObjectStoreParameters(options: TableStoreOptions): IDBObjectStoreParameters {
    const params: IDBObjectStoreParameters = {};
    if (options.primaryKeyColumn) params.keyPath = options.primaryKeyColumn;
    if (options.autoIncrement) params.autoIncrement = options.autoIncrement;
    return params;
}

function createTable(target: IDBDatabase, iterator: Generator<TableDefinition, void, unknown>): void {
    const result = iterator.next();
    if (result.done) return;
    const table = result.value;
    const tableName = table.name;
    const options = toObjectStoreParameters(table.options || {});
    const indices = table.indices || [];
    if (tableName) {
        const objStore = target.createObjectStore(tableName, options);
        if (indices.length > 0) {
            indices.forEach((index) => {
                createIndex(objStore, index);
            });
        }
        objStore.transaction.oncomplete = () => {
            createTable(target, iterator);
        };
    } else {
        throw Error('Table name is required');
    }
}

function addRecords<T>(objStore: IDBObjectStore, iterator: Generator<T, void, unknown>): void {
    const ite = iterator.next();
    if (ite.done) return;
    const objStoreRequest = objStore.add(ite.value);
    objStoreRequest.onsuccess = () => {
        addRecords(objStore, iterator);
    };
}

export function getNativeDB(): IDBDatabase | undefined {
    return db;
}

export function getDbName(): string | undefined {
    return currentDbName;
}

export function getDbVersion(): number | undefined {
    return currentVersion;
}

export function setupDatabase({ name, version, tables = [] }: SetupDatabaseOptions): Promise<void> {
    currentDbName = name;
    currentVersion = version;
    const [promise, resolve, reject] = promisify<void>();
    const request = getIdb().open(name, version);

    request.onsuccess = (e) => {
        db = (e.target as IDBOpenDBRequest).result;
        resolve();
    };

    request.onerror = (e) => {
        reject(toError(`Failed to open database "${name}"`, e));
    };

    request.onupgradeneeded = (e) => {
        const target = (e.target as IDBOpenDBRequest).result;
        db = target;
        if (version === 1) {
            const gen = createGenerator(tables);
            createTable(target, gen);
        }
        const transaction = (e.target as IDBOpenDBRequest).transaction!;
        transaction.oncomplete = () => {
            resolve();
        };
    };
    return promise;
}

export function queryTableCursor<T = unknown>({
    table,
    index: indexName,
    query,
    direction = 'next',
    count,
    offset,
}: QueryTableCursorOptions): Promise<QueryTableCursorResult<T>> {
    const [promise, resolve, reject] = promisify<QueryTableCursorResult<T>>();
    const results: T[] = [];
    let hasSkipped = !offset;
    let awaitingNextOffset = false;
    const transaction = requireDb().transaction([table], 'readonly');
    const objectStore = transaction.objectStore(table);
    const index = objectStore.index(indexName);
    const keyRange = toKeyRange(query);
    const request = keyRange === undefined ? index.openCursor(null, direction) : index.openCursor(keyRange, direction);

    transaction.onerror = (e) => {
        reject(toError(`queryTableCursor("${table}", "${indexName}") failed`, e));
    };

    request.onsuccess = () => {
        const cursor = request.result;

        if (awaitingNextOffset) {
            resolve({
                results,
                nextOffset: cursor ? { key: cursor.key, primaryKey: cursor.primaryKey } : undefined,
            });
            return;
        }

        if (!cursor) {
            resolve({ results, nextOffset: undefined });
            return;
        }

        if (!hasSkipped) {
            hasSkipped = true;
            cursor.continuePrimaryKey(offset!.key, offset!.primaryKey);
            return;
        }

        const value = cursor.value;
        value && results.push(value);

        if (count !== undefined && results.length >= count) {
            awaitingNextOffset = true;
            cursor.continue();
        } else {
            cursor.continue();
        }
    };

    request.onerror = (e) => {
        reject(toError(`queryTableCursor("${table}", "${indexName}") failed`, e));
    };
    return promise;
}

export function queryTable<T = unknown>({ table, query, count }: QueryTableOptions): Promise<T[]> {
    const [promise, resolve, reject] = promisify<T[]>();
    const transaction = requireDb().transaction([table], 'readonly');
    const objectStore = transaction.objectStore(table);
    const request = objectStore.getAll(toKeyRange(query), count);

    request.onsuccess = (e) => {
        resolve((e.target as IDBRequest<T[]>).result);
    };

    request.onerror = (e) => {
        reject(toError(`queryTable("${table}") failed`, e));
    };
    return promise;
}

export function insertRecords<T>({ table, data = [] }: InsertRecordsOptions<T>): Promise<void> {
    const [promise, resolve, reject] = promisify<void>();
    const transaction = requireDb().transaction([table], 'readwrite');
    const objStore = transaction.objectStore(table);
    const gen = createGenerator(data);
    addRecords(objStore, gen);

    transaction.oncomplete = () => {
        resolve();
    };
    transaction.onerror = (e) => {
        reject(toError(`insertRecords("${table}") failed`, e));
    };
    return promise;
}

/**
 * Puts one or more records into a table. An array bulk-adds new records
 * (fails if a key already exists); a single record is put as-is, optionally
 * at an explicit key. To patch an existing record, read it via queryTable
 * first and pass the merged object back in.
 */
export function upsertTable<T>({ table, data, key }: UpsertTableOptions<T>): Promise<void> {
    if (Array.isArray(data)) {
        return insertRecords({ table, data });
    }
    const [promise, resolve, reject] = promisify<void>();
    const objStore = requireDb().transaction([table], 'readwrite').objectStore(table);
    const request = key !== undefined ? objStore.put(data, key) : objStore.put(data);
    request.onsuccess = () => {
        resolve();
    };
    request.onerror = (e) => {
        reject(toError(`upsertTable("${table}") failed`, e));
    };
    return promise;
}

export function deleteRecord({ table, key }: DeleteRecordOptions): Promise<void> {
    const [promise, resolve, reject] = promisify<void>();
    const transaction = requireDb().transaction([table], 'readwrite');
    const objStore = transaction.objectStore(table);
    objStore.delete(key);
    transaction.oncomplete = () => {
        resolve();
    };
    transaction.onerror = (e) => {
        reject(toError(`deleteRecord("${table}") failed`, e));
    };
    return promise;
}

export function deleteDatabase(): void {
    getIdb().deleteDatabase(currentDbName!);
    db = undefined;
}

// --- Flat key/value API (schemaless, lazily auto-initialized) ------------

let kvDbName = DEFAULT_KV_DB_NAME;
let kvStoreName = DEFAULT_KV_STORE_NAME;
let kvReady: Promise<void> | undefined;
let kvDb: IDBDatabase | undefined;

/** Optionally override the KV database/store name before the first getItem/setItem/removeItem call. */
export function configureKvStore(options: KvOptions): void {
    if (kvReady) {
        throw new Error('configureKvStore() must be called before the first getItem/setItem/removeItem call.');
    }
    kvDbName = options.kvDbName ?? DEFAULT_KV_DB_NAME;
    kvStoreName = options.kvStoreName ?? DEFAULT_KV_STORE_NAME;
}

function ensureKvReady(): Promise<void> {
    if (!kvReady) {
        kvReady = new Promise((resolve, reject) => {
            const request = getIdb().open(kvDbName, KV_VERSION);
            request.onupgradeneeded = () => {
                const target = request.result;
                if (!target.objectStoreNames.contains(kvStoreName)) {
                    target.createObjectStore(kvStoreName);
                }
            };
            request.onsuccess = () => {
                kvDb = request.result;
                resolve();
            };
            request.onerror = (e) => {
                reject(toError(`Failed to open KV database "${kvDbName}"`, e));
            };
        });
    }
    return kvReady;
}

export async function getItem<T = unknown>(key: IDBValidKey): Promise<T | undefined> {
    await ensureKvReady();
    const [promise, resolve, reject] = promisify<T | undefined>();
    const request = kvDb!
        .transaction([kvStoreName], 'readonly')
        .objectStore(kvStoreName)
        .get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(toError(`getItem("${String(key)}") failed`, e));
    return promise;
}

export async function setItem<T>(key: IDBValidKey, value: T): Promise<void> {
    await ensureKvReady();
    const [promise, resolve, reject] = promisify<void>();
    const request = kvDb!
        .transaction([kvStoreName], 'readwrite')
        .objectStore(kvStoreName)
        .put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(toError(`setItem("${String(key)}") failed`, e));
    return promise;
}

export async function removeItem(key: IDBValidKey): Promise<void> {
    await ensureKvReady();
    const [promise, resolve, reject] = promisify<void>();
    const request = kvDb!
        .transaction([kvStoreName], 'readwrite')
        .objectStore(kvStoreName)
        .delete(key);
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(toError(`removeItem("${String(key)}") failed`, e));
    return promise;
}
