const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

test('Backend khởi tạo API chat khi Render chỉ cung cấp thư mục backend', () => {
  const root = path.resolve(__dirname, '..');
  const script = `
    const path = require('path'), Module = require('module');
    const root = process.cwd(), original = Module._load;
    Module._load = function (request, parent, isMain) {
      if (request.startsWith('.')) {
        const resolved = Module._resolveFilename(request, parent);
        if (!resolved.startsWith(root + path.sep)) throw new Error('Phụ thuộc ngoài Root Directory: ' + request);
      }
      return original.call(this, request, parent, isMain);
    };
    require('./app'); require('./utils/migrateChat'); require('./middlewares/socketAuth');
    process.stdout.write('backend-contained');
  `;
  expect(execFileSync(process.execPath, ['-e', script], { cwd: root, encoding: 'utf8', timeout: 10000 })).toBe('backend-contained');
});

// Full-repository CI also checks that independent service bundles use the same sticker IDs.
const frontendCatalog = path.resolve(__dirname, '../../frontend/src/data/chatStickers.json');
(fs.existsSync(frontendCatalog) ? test : test.skip)('Danh mục sticker đồng nhất giữa hai ứng dụng triển khai độc lập', () => {
  const backend = require('../data/chatStickers.json');
  const frontend = JSON.parse(fs.readFileSync(frontendCatalog, 'utf8'));
  expect(frontend).toEqual(backend);
  expect(new Set(backend.map((s) => s.id)).size).toBe(backend.length);
});
