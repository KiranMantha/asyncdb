// Import stylesheets
import './style.css';
import { AsyncDB } from './asyncdb';
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
      keyPath: 'id',
      autoIncrement: true,
    },
    indices: [
      {
        name: 'name',
        keyPath: 'name',
        options: {
          unique: false,
        },
      },
    ],
  },
];

const asyncDBInstance = new AsyncDB();

asyncDBInstance.setup('CustomersDB', 1, tables).then((db) => {
  showCustomers();
});

function addCustomer(e) {
  e.preventDefault();
  let data = serializeArray(e.target);
  asyncDBInstance.setData('customers', [data]).then((e) => {
    customerinpt.value = '';
    showCustomers();
  });
}

function showCustomers() {
  tblCustomersBody.innerHTML = '';
  asyncDBInstance.getAll('customers').then((data) => {
    if (data.length > 0) {
      data.forEach((item) => {
        appendRecord(item.id, item.name);
      });
    }
  });
  asyncDBInstance.getDataCursor('customers', 'name').then((data) => {
    console.log(data);
  });
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
    asyncDBInstance.updateData('customers', id, { name: value }).then(() => {
      console.log('customer updated');
      showCustomers();
    });
  }
}

function removeCustomer(id) {
  console.log(id);
  asyncDBInstance.deleteData('customers', id).then(() => {
    console.log('customer deleted');
    showCustomers();
  });
}

function deleteDB() {
  asyncDBInstance.deleteDatabase();
  window.location.reload();
}

function exportData() {
  let nativeDB = asyncDBInstance.nativeDB;
  exportToJsonString(nativeDB, function (err, jsonString) {
    if (err) {
      console.error(err);
    } else {
      console.log('Exported as JSON: ' + jsonString);
    }
  });
}

window.addCustomer = addCustomer;
window.updateCustomer = updateCustomer;
window.removeCustomer = removeCustomer;
window.exportData = exportData;
window.deleteDB = deleteDB;
