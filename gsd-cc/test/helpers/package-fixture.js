const fs = require('fs');
const path = require('path');

const packageRoot = path.resolve(__dirname, '..', '..');

function copyPackageFixture(tempRoot) {
  const fixtureRoot = path.join(tempRoot, 'gsd-cc');
  fs.cpSync(packageRoot, fixtureRoot, {
    recursive: true,
    filter: (source) => {
      const relative = path.relative(packageRoot, source);
      if (!relative) {
        return true;
      }

      const parts = relative.split(path.sep);
      return !parts.includes('.git') &&
        !parts.includes('node_modules') &&
        !parts.includes('output');
    }
  });
  return fixtureRoot;
}

function makeSourceHooksNonExecutable(fixtureRoot) {
  const hooksDir = path.join(fixtureRoot, 'hooks');
  for (const entry of fs.readdirSync(hooksDir)) {
    if (entry.endsWith('.sh')) {
      fs.chmodSync(path.join(hooksDir, entry), 0o644);
    }
  }
}

module.exports = {
  copyPackageFixture,
  makeSourceHooksNonExecutable,
  packageRoot
};
