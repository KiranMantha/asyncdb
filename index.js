export const DBTransactionStatus = {
    SUCCESS: 'SUCCESS',
    ERROR: 'ERROR',
};

function createGenerator(array) {
    function* gen() {
        yield* array;
    }
    return gen();
}

function promisify() {
    let resolver;
    const promise = new Promise((resolve) => {
        resolver = resolve;
    });
    return [promise, resolver];
}

function generateResponse(status, data) {
    return { status, data };
}

export class AsyncDB {
    #db;
    #idb;
    #dbName;
    #version;
    #debug;

    constructor(debug = false) {
        this.#debug = debug;
        this.#idb =
            window.indexedDB ||
            window.mozIndexedDB ||
            window.webkitIndexedDB ||
            window.msIndexedDB;

        if (!this.#idb) {
            throw Error(
                "Your browser doesn't support a stable version of IndexedDB."
            );
        }
    }

    get version() {
        return this.#version;
    }

    get dbName() {
        return this.#dbName;
    }

    get transaction() {
        return (
            window.IDBTransaction ||
            window.webkitIDBTransaction ||
            window.msIDBTransaction
        );
    }

    get keyRange() {
        return (
            window.IDBKeyRange || window.webkitIDBKeyRange || window.msIDBKeyRange
        );
    }

    get nativeDB() {
        return this.#db;
    }

    #createIndex(objStore, index) {
        if (index.name && index.keyPath) {
            objStore.createIndex(index.name, index.keyPath, index.options || {});
        } else {
            throw Error('createIndex requires name and keyPath');
        }
    }

    #createTable(iterator) {
        const self = this;
        const result = iterator.next();
        if (result.done) return;
        const table = result.value;
        const tableName = table.name;
        const options = table.options || {};
        const indices = table.indices || [];
        if (tableName) {
            const objStore = this.#db.createObjectStore(tableName, options);
            if (indices.length > 0) {
                indices.forEach((index) => {
                    self.#createIndex(objStore, index);
                });
            }
            objStore.transaction.oncomplete = (e) => {
                self.#createTable(iterator);
            };
        } else {
            throw Error('Table name is required');
        }
    }

    #addRecord(objStore, iterator) {
        const self = this;
        const ite = iterator.next();
        if (ite.done) return;
        const objStoreRequest = objStore.add(ite.value);
        objStoreRequest.onsuccess = (e) => {
            self.#addRecord(objStore, iterator);
        };
    }

    setup(dbname, version, tables = []) {
        const self = this;
        this.#dbName = dbname;
        this.#version = version;
        const [promise, resolver] = promisify();
        const request = this.#idb.open(dbname, version);

        request.onsuccess = (e) => {
            self.#db = e.target.result;
            resolver(
                generateResponse(
                    DBTransactionStatus.SUCCESS,
                    'Database setup successful'
                )
            );
        };

        request.onerror = (e) => {
            resolver(generateResponse(DBTransactionStatus.ERROR, e));
        };

        request.onupgradeneeded = (e) => {
            self.#db = e.target.result;
            if (version === 1) {
                let gen = createGenerator(tables);
                self.#createTable(gen);
            }
            const transaction = e.target.transaction;
            transaction.oncomplete = (e) => {
                resolver(
                    generateResponse(
                        DBTransactionStatus.SUCCESS,
                        'Database setup successful'
                    )
                );
            };
        };
        return promise;
    }

    getDataCursor(tableName, indexName, query = '', direction = 'next') {
        const [promise, resolver] = promisify();
        const results = [];
        const transaction = this.#db.transaction([tableName], 'readonly');
        const objectStore = transaction.objectStore(tableName);
        const index = objectStore.index(indexName);
        let request;
        if (!query) {
            request = index.openCursor();
        } else {
            request = index.openCursor(query, direction);
        }

        transaction.onerror = (e) => {
            resolver(generateResponse(DBTransactionStatus.ERROR, e));
        };

        request.onsuccess = (e) => {
            const cursor = request.result;
            if (cursor) {
                const value = cursor.value;
                value && results.push(value);
                cursor.continue();
            } else {
                resolver(generateResponse(DBTransactionStatus.SUCCESS, results));
            }
        };

        request.onerror = (e) => {
            resolver(generateResponse(DBTransactionStatus.ERROR, e));
        };
        return promise;
    }

    getAll(tableName) {
        const [promise, resolver] = promisify();
        const transaction = this.#db.transaction([tableName], 'readonly');
        const objectStore = transaction.objectStore(tableName);
        const request = objectStore.getAll();

        request.onsuccess = (e) => {
            resolver(generateResponse(DBTransactionStatus.SUCCESS, e.target.result));
        };

        request.onerror = (e) => {
            resolver(generateResponse(DBTransactionStatus.ERROR, e));
        };
        return promise;
    }

    getAll(tableName, query) {
        const [promise, resolver] = promisify();
        const transaction = this.#db.transaction([tableName], 'readonly');
        const objectStore = transaction.objectStore(tableName);
        const request = objectStore.getAll(query);

        request.onsuccess = (e) => {
            resolver(generateResponse(DBTransactionStatus.SUCCESS, e.target.result));
        };

        request.onerror = (e) => {
            resolver(generateResponse(DBTransactionStatus.ERROR, e));
        };
        return promise;
    }

    getAll(tableName, query, count) {
        const [promise, resolver] = promisify();
        const transaction = this.#db.transaction([tableName], 'readonly');
        const objectStore = transaction.objectStore(tableName);
        const request = objectStore.getAll(query, count);

        request.onsuccess = (e) => {
            resolver(generateResponse(DBTransactionStatus.SUCCESS, e.target.result));
        };

        request.onerror = (e) => {
            resolver(generateResponse(DBTransactionStatus.ERROR, e));
        };
        return promise;
    }

    setData(tableName, data = []) {
        const [promise, resolver] = promisify();
        const transaction = this.#db.transaction([tableName], 'readwrite');
        const objStore = transaction.objectStore(tableName);
        const gen = createGenerator(data);
        this.#addRecord(objStore, gen);

        transaction.oncomplete = (e) => {
            resolver(generateResponse(DBTransactionStatus.SUCCESS));
        };
        transaction.onerror = (e) => {
            resolver(generateResponse(DBTransactionStatus.ERROR, e));
        };
        return promise;
    }

    updateData(tableName, index, value) {
        const [promise, resolver] = promisify();
        const objStore = this.#db
            .transaction([tableName], 'readwrite')
            .objectStore(tableName);
        const objIndexReq = objStore.get(index);
        objIndexReq.onsuccess = (e) => {
            const data = objIndexReq.result;
            const newdata = Object.assign(data, value);
            const updateReq = objStore.put(data);
            updateReq.onsuccess = () => {
                resolver(generateResponse(DBTransactionStatus.SUCCESS, true));
            };
            updateReq.onerror = (e) => {
                resolver(generateResponse(DBTransactionStatus.ERROR, e));
            };
        };
        objIndexReq.onerror = (e) => {
            resolver(generateResponse(DBTransactionStatus.ERROR, e));
        };
        return promise;
    }

    deleteData(tableName, index) {
        const [promise, resolver] = promisify();
        const transaction = this.#db.transaction([tableName], 'readwrite');
        const objStore = transaction.objectStore(tableName);
        objStore.delete(index);
        transaction.oncomplete = (e) => {
            resolver(generateResponse(DBTransactionStatus.SUCCESS, true));
        };
        transaction.onerror = (e) => {
            resolver(generateResponse(DBTransactionStatus.ERROR, e));
        };
        return promise;
    }

    deleteDatabase() {
        this.#idb.deleteDatabase(this.#dbName);
        this.#db = null;
    }

    bulkPut(tableName, data, key) {
        const [promise, resolver] = promisify();
        const objStore = this.#db
            .transaction([tableName], 'readwrite')
            .objectStore(tableName);
        const request = key ? objStore.put(data, key) : objStore.put(data);
        request.onsuccess = (e) => {
            resolver(generateResponse(DBTransactionStatus.SUCCESS));
        };
        request.onerror = (e) => {
            resolver(generateResponse(DBTransactionStatus.ERROR, e));
        };
        return promise;
    }
}
