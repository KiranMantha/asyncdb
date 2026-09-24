//https://medium.com/@AndyHaskell2013/build-a-basic-web-app-with-indexeddb-8ab4f83f8bda
// Import stylesheets
// import './styles.css';
import {
  setupDatabase,
  insertRecords,
  queryTable,
  queryTableCursor,
  upsertTable,
  deleteRecord,
  deleteDatabase,
  getNativeDB,
  getItem,
  setItem,
  removeItem,
} from '../dist/index.js';
import { exportToJsonString } from 'indexeddb-export-import';

// Write Javascript code!

function byId(selector) {
  return document.getElementById(selector);
}

function createEle(nodename) {
  return document.createElement(nodename);
}

const appDiv = byId('app');
const customerForm = byId('customerForm');
const customerinpt = byId('name');
const tblCustomersBody = byId('tblCustomers').querySelector('tbody');
appDiv.innerHTML = `<h1>JS Starter</h1>`;

function serializeArray(form) {
  var field,
    l,
    s = {};
  if (typeof form == 'object' && form.nodeName == 'FORM') {
    var len = form.elements.length;
    for (var i = 0; i < len; i++) {
      field = form.elements[i];
      if (
        field.name &&
        !field.disabled &&
        field.type != 'file' &&
        field.type != 'reset' &&
        field.type != 'submit' &&
        field.type != 'button'
      ) {
        if (field.type == 'select-multiple') {
          l = form.elements[i].options.length;
          for (j = 0; j < l; j++) {
            if (field.options[j].selected)
              s[field.name] = field.options[j].value;
          }
        } else if (
          (field.type != 'checkbox' && field.type != 'radio') ||
          field.checked
        ) {
          s[field.name] = field.value;
        }
      }
    }
  }
  return s;
}

const tables = [
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
        options: {
          unique: false,
        },
      },
    ],
  },
];

setupDatabase({ name: 'CustomersDB', version: 1, tables })
  .then(() => showCustomers())
  .catch((err) => console.error('Failed to set up database', err));

function addCustomer(e) {
  e.preventDefault();
  let data = serializeArray(e.target);
  insertRecords({ table: 'customers', data: [data] })
    .then(() => {
      customerinpt.value = '';
      showCustomers();
    })
    .catch((err) => console.error('Failed to add customer', err));
}

function showCustomers() {
  tblCustomersBody.innerHTML = '';
  queryTable({ table: 'customers' })
    .then((data) => {
      data.forEach((item) => {
        appendRecord(item.id, item.name);
      });
    })
    .catch((err) => console.error('Failed to load customers', err));
  queryTableCursor({ table: 'customers', index: 'name' })
    .then(({ results }) => {
      console.log(results);
    })
    .catch((err) => console.error('Failed to load customers cursor', err));
}

function appendRecord(id, name) {
  let tr = createEle('tr');
  tr.innerHTML = `<td data-label="Id">${id}</td>
  <td data-label="Name">
    <div contenteditable="true" data-rid='${id}' onkeypress='updateCustomer(event)'>${name}</div>
  </td>
  <td data-label="Action">
    <a href='#' onclick='removeCustomer(${id})'>delete</a>
  </td>`;
  tblCustomersBody.appendChild(tr);
}

function updateCustomer(e) {
  if (e.which == 13) {
    let value = e.target.innerText;
    let id = parseInt(e.target.getAttribute('data-rid'));
    upsertTable({ table: 'customers', data: { id, name: value } })
      .then(() => {
        console.log('customer updated');
        showCustomers();
      })
      .catch((err) => console.error('Failed to update customer', err));
  }
}

function removeCustomer(id) {
  console.log(id);
  deleteRecord({ table: 'customers', key: id })
    .then(() => {
      console.log('customer deleted');
      showCustomers();
    })
    .catch((err) => console.error('Failed to delete customer', err));
}

function deleteDB() {
  deleteDatabase();
  window.location.reload();
}

function exportData() {
  let nativeDB = getNativeDB();
  exportToJsonString(nativeDB, function (err, jsonString) {
    if (err) {
      console.error(err);
    } else {
      console.log('Exported as JSON: ' + jsonString);
    }
  });
}

const NOTES_KEY = 'notes';
const notesInpt = byId('notes');

getItem(NOTES_KEY)
  .then((value) => {
    if (value !== undefined) {
      notesInpt.value = value;
    }
  })
  .catch((err) => console.error('Failed to load note', err));

let notesSaveTimeout;
function saveNotes(e) {
  clearTimeout(notesSaveTimeout);
  const value = e.target.value;
  notesSaveTimeout = setTimeout(() => {
    setItem(NOTES_KEY, value).catch((err) => console.error('Failed to save note', err));
  }, 300);
}

function clearNotes(e) {
  e.preventDefault();
  removeItem(NOTES_KEY)
    .then(() => {
      notesInpt.value = '';
    })
    .catch((err) => console.error('Failed to clear note', err));
}

notesInpt.addEventListener('input', saveNotes);

window.addCustomer = addCustomer;
window.updateCustomer = updateCustomer;
window.removeCustomer = removeCustomer;
window.exportData = exportData;
window.deleteDB = deleteDB;
window.clearNotes = clearNotes;
