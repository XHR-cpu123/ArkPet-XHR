const path = require("node:path");

const sharp = require(path.join(__dirname, "..", "node_modules", "sharp"));
const expectedArch = process.env.EXPECTED_MAC_ARCH;

if (expectedArch && process.arch !== expectedArch) {
  throw new Error(`Expected ${expectedArch}, running as ${process.arch}`);
}

console.log(`sharp ${sharp.versions.sharp} with libvips ${sharp.versions.vips} loaded on ${process.platform}-${process.arch}`);
