function createGenerator(array) {
  function* gen() {
    yield* array;
  }
  return gen();
}

function promisify() {
  let resolver, errorFn;

  const promise = new Promise((resolve, reject) => {
    resolver = resolve;
    errorFn = reject;
  });
  return [promise, resolver, errorFn];
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

  _createIndex(objStore, index) {
    if (index.name && index.keyPath) {
      objStore.createIndex(index.name, index.keyPath, index.options || {});
    } else {
      throw Error('createIndex requires name and keyPath');
    }
  }

  _createTable(iterator) {
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
          self._createIndex(objStore, index);
        });
      }
      objStore.transaction.oncomplete = (e) => {
        self._createTable(iterator);
      };
    } else {
      throw Error('Table name is required');
    }
  }

  _addRecord(objStore, iterator) {
    const self = this;
    const ite = iterator.next();
    if (ite.done) return;
    const objStoreRequest = objStore.add(ite.value);
    objStoreRequest.onsuccess = (e) => {
      self._addRecord(objStore, iterator);
    };
  }

  setup(dbname, version, tables = []) {
    const self = this;
    this.#dbName = dbname;
    this.#version = version;
    const [promise, resolver, errorFn] = promisify();
    const request = this.#idb.open(dbname, version);

    request.onsuccess = (e) => {
      self.#db = e.target.result;
      resolver(self.#db);
    };

    request.onerror = (e) => {
      errorFn(e);
    };

    request.onupgradeneeded = (e) => {
      self.#db = e.target.result;
      if (version === 1) {
        let gen = createGenerator(tables);
        self._createTable(gen);
      }
      const transaction = e.target.transaction;
      transaction.oncomplete = (e) => {
        resolver(self.#db);
      };
    };
    return promise;
  }

  getDataCursor(tableName, indexName, query = '', direction = 'next') {
    const [promise, resolver, errorFn] = promisify();
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
      errorFn(e);
    };

    request.onsuccess = (e) => {
      const cursor = request.result;
      if (cursor) {
        const value = cursor.value;
        value && results.push(value);
        cursor.continue();
      } else {
        resolver(results);
      }
    };

    request.onerror = (e) => {
      errorFn(e);
    };
    return promise;
  }

  getAll(tableName) {
    const [promise, resolver, errorFn] = promisify();
    const transaction = this.#db.transaction([tableName], 'readonly');
    const objectStore = transaction.objectStore(tableName);
    const request = objectStore.getAll();

    request.onsuccess = (e) => {
      resolver(e.target.result);
    };

    request.onerror = (e) => {
      errorFn(e);
    };
    return promise;
  }

  getAll(tableName, query) {
    const [promise, resolver, errorFn] = promisify();
    const transaction = this.#db.transaction([tableName], 'readonly');
    const objectStore = transaction.objectStore(tableName);
    const request = objectStore.getAll(query);

    request.onsuccess = (e) => {
      resolver(e.target.result);
    };

    request.onerror = (e) => {
      errorFn(e);
    };
    return promise;
  }

  getAll(tableName, query, count) {
    const [promise, resolver, errorFn] = promisify();
    const transaction = this.#db.transaction([tableName], 'readonly');
    const objectStore = transaction.objectStore(tableName);
    const request = objectStore.getAll(query, count);

    request.onsuccess = (e) => {
      resolver(e.target.result);
    };

    request.onerror = (e) => {
      errorFn(e);
    };
    return promise;
  }

  setData(tableName, data = []) {
    const [promise, resolver, errorFn] = promisify();
    const transaction = this.#db.transaction([tableName], 'readwrite');
    const objStore = transaction.objectStore(tableName);
    const gen = createGenerator(data);
    this._addRecord(objStore, gen);

    transaction.oncomplete = (e) => {
      resolver();
    };
    transaction.onerror = (e) => {
      errorFn(e);
    };
    return promise;
  }

  updateData(tableName, index, value) {
    const [promise, resolver, errorFn] = promisify();
    const objStore = this.#db
      .transaction([tableName], 'readwrite')
      .objectStore(tableName);
    const objIndexReq = objStore.get(index);
    objIndexReq.onsuccess = (e) => {
      const data = objIndexReq.result;
      const newdata = Object.assign(data, value);
      const updateReq = objStore.put(data);
      updateReq.onsuccess = (e) => {
        resolver(true);
      };
      updateReq.onerror = (e) => {
        errorFn(e);
      };
    };
    objIndexReq.onerror = (e) => {
      errorFn(e);
    };
    return promise;
  }

  deleteData(tableName, index) {
    const [promise, resolver, errorFn] = promisify();
    const transaction = this.#db.transaction([tableName], 'readwrite');
    const objStore = transaction.objectStore(tableName);
    objStore.delete(index);
    transaction.oncomplete = (e) => {
      resolver(true);
    };
    transaction.onerror = (e) => {
      errorFn(e);
    };
    return promise;
  }

  deleteDatabase() {
    this.#idb.deleteDatabase(this.#dbName);
    this.#db = null;
  }

  bulkPut(tableName, data, key) {
    const [promise, resolver, errorFn] = promisify();
    const objStore = this.#db
      .transaction([tableName], 'readwrite')
      .objectStore(tableName);
    const request = key ? objStore.put(data, key) : objStore.put(data);
    request.onsuccess = (e) => {
      resolver();
    };
    request.onerror = (e) => {
      errorFn(e);
    };
    return promise;
  }
}
