// Chi nhánh mà shipper đang làm việc: đang điều chuyển tạm thời thì lấy chi nhánh điều chuyển, không thì chi nhánh chính
const { activeTransfer } = require('./staffScope');
async function workingStore(account) {
  const transfer = await activeTransfer(account._id); // lệnh điều chuyển đang hiệu lực (nếu có)
  return transfer?.storeId || account.storeId || null;
}
const idOf = value => String(value?._id || value || ''); // id dạng chuỗi từ ObjectId / document / null
module.exports = { workingStore, idOf };
