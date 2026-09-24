type TableIndex = {
    name: string;
    columns: string[];
    options?: IDBIndexParameters;
};
type TableStoreOptions = {
    primaryKeyColumn?: string;
    autoIncrement?: boolean;
};
type TableDefinition = {
    name: string;
    options?: TableStoreOptions;
    indices?: TableIndex[];
};
type KvOptions = {
    kvDbName?: string;
    kvStoreName?: string;
};
type SetupDatabaseOptions = {
    name: string;
    version: number;
    tables?: TableDefinition[];
};
type TableQueryRange = {
    gt?: IDBValidKey;
    gte?: IDBValidKey;
    lt?: IDBValidKey;
    lte?: IDBValidKey;
};
type TableQuery = IDBValidKey | TableQueryRange;
type QueryTableOptions = {
    table: string;
    query?: TableQuery;
    count?: number;
};
type QueryTableCursorOffset = {
    key: IDBValidKey;
    primaryKey: IDBValidKey;
};
type QueryTableCursorOptions = {
    table: string;
    index: string;
    query?: TableQuery;
    direction?: IDBCursorDirection;
    count?: number;
    offset?: QueryTableCursorOffset;
};
type QueryTableCursorResult<T> = {
    results: T[];
    nextOffset: QueryTableCursorOffset | undefined;
};
type UpsertTableOptions<T> = {
    table: string;
    data: T | T[];
    key?: IDBValidKey;
};
type InsertRecordsOptions<T> = {
    table: string;
    data?: T[];
};
type DeleteRecordOptions = {
    table: string;
    key: IDBValidKey;
};
declare function getNativeDB(): IDBDatabase | undefined;
declare function getDbName(): string | undefined;
declare function getDbVersion(): number | undefined;
declare function setupDatabase({ name, version, tables }: SetupDatabaseOptions): Promise<void>;
declare function queryTableCursor<T = unknown>({ table, index: indexName, query, direction, count, offset, }: QueryTableCursorOptions): Promise<QueryTableCursorResult<T>>;
declare function queryTable<T = unknown>({ table, query, count }: QueryTableOptions): Promise<T[]>;
declare function insertRecords<T>({ table, data }: InsertRecordsOptions<T>): Promise<void>;
/**
 * Puts one or more records into a table. An array bulk-adds new records
 * (fails if a key already exists); a single record is put as-is, optionally
 * at an explicit key. To patch an existing record, read it via queryTable
 * first and pass the merged object back in.
 */
declare function upsertTable<T>({ table, data, key }: UpsertTableOptions<T>): Promise<void>;
declare function deleteRecord({ table, key }: DeleteRecordOptions): Promise<void>;
declare function deleteDatabase(): void;
/** Optionally override the KV database/store name before the first getItem/setItem/removeItem call. */
declare function configureKvStore(options: KvOptions): void;
declare function getItem<T = unknown>(key: IDBValidKey): Promise<T | undefined>;
declare function setItem<T>(key: IDBValidKey, value: T): Promise<void>;
declare function removeItem(key: IDBValidKey): Promise<void>;

export { type DeleteRecordOptions, type InsertRecordsOptions, type KvOptions, type QueryTableCursorOffset, type QueryTableCursorOptions, type QueryTableCursorResult, type QueryTableOptions, type SetupDatabaseOptions, type TableDefinition, type TableIndex, type TableQuery, type TableQueryRange, type TableStoreOptions, type UpsertTableOptions, configureKvStore, deleteDatabase, deleteRecord, getDbName, getDbVersion, getItem, getNativeDB, insertRecords, queryTable, queryTableCursor, removeItem, setItem, setupDatabase, upsertTable };
