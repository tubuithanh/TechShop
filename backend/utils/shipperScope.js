const { activeTransfer } = require('./staffScope');
async function workingStore(account) {
  const transfer = await activeTransfer(account._id);
  return transfer?.storeId || account.storeId || null;
}
const idOf = value => String(value?._id || value || '');
module.exports = { workingStore, idOf };
