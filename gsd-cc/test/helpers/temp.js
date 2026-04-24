const fs = require('fs');
const os = require('os');
const path = require('path');

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function makeIsolatedHome(prefix = 'gsd-cc-home-') {
  return makeTempDir(prefix);
}

module.exports = {
  makeIsolatedHome,
  makeTempDir
};
