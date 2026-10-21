'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const semver = require('semver');
const { normalizeManifest } = require('../../shared/plugins/manifest');
const { localize } = require('../../shared/plugins/localized');
const { missingGrant, riskSummary } = require('../../shared/plugins/permissions');
const MAX_PACKAGE_BYTES = 2 * 1024 * 1024;
const { MAX_CODE_BYTES, MAX_MANIFEST_BYTES, assertHostCompatibility } = require('./contracts');
const ID_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
function digest(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function readBounded(file, limit) {
  const fd = fs.openSync(file, 'r');
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > limit) throw new Error(`file exceeds ${limit} bytes or is not a regular file`);
    const buffer = Buffer.alloc(limit + 1);
    let count = 0, read;
    while (count <= limit && (read = fs.readSync(fd, buffer, count, buffer.length - count, null))) count += read;
    if (count > limit) throw new Error(`file exceeds ${limit} bytes`);
    return buffer.subarray(0, count);
  } finally { fs.closeSync(fd); }
}
function entryName(name) {
  if (typeof name !== 'string' || !name.endsWith('.js') || name.length > 120) return false;
  return name.split('/').every(part => /^[a-zA-Z0-9_-][a-zA-Z0-9._-]*$/.test(part) && !part.endsWith('.') && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part));
}
function parsePackage(bytes, { checkCompatibility = true } = {}) {
  if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
  if (bytes.length > MAX_PACKAGE_BYTES) throw new Error('plugin package exceeds 2 MB');
  let data;
  try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { throw new Error('plugin package must contain valid UTF-8 JSON'); }
  if (!data || data.format !== 1 || !data.manifest || Array.isArray(data.manifest)) throw new Error('unsupported plugin package format');
  if (Object.keys(data).some(key => !['format', 'manifest', 'code'].includes(key))) throw new Error('unknown package fields');
  if (Buffer.byteLength(JSON.stringify(data.manifest)) > MAX_MANIFEST_BYTES) throw new Error('manifest exceeds 256 KB');
  let result;
  try { result = normalizeManifest(data.manifest); } catch { throw new Error('invalid plugin manifest'); }
  if (!result.ok || result.errors.length) throw new Error(`invalid plugin manifest: ${result.errors.join('; ')}`);
  if (checkCompatibility) assertHostCompatibility(data.manifest);
  if (!semver.valid(result.manifest.version)) throw new Error('invalid plugin version');
  if (result.manifest.main) {
    if (!entryName(result.manifest.main)) throw new Error('entry must be a portable, contained .js path');
    if (typeof data.code !== 'string' || Buffer.byteLength(data.code) > MAX_CODE_BYTES) throw new Error('entry code must be text under 512 KB');
  } else if (data.code !== undefined && data.code !== null) throw new Error('package has code but manifest has no main');
  return { bytes: Buffer.from(bytes), hash: digest(bytes), manifest: result.manifest, rawManifest: data.manifest, code: data.code ?? null };
}
function packageDirectory(dir, options) {
  const root = fs.realpathSync(dir);
  const inside = name => {
    const file = fs.realpathSync(path.join(root, name));
    if (!file.startsWith(`${root}${path.sep}`)) throw new Error('plugin file escapes its directory');
    return file;
  };
  const manifest = JSON.parse(readBounded(inside('manifest.json'), MAX_MANIFEST_BYTES).toString('utf8'));
  if (manifest.main && !entryName(manifest.main)) throw new Error('invalid entry path');
  const code = manifest.main ? new TextDecoder('utf-8', { fatal: true }).decode(readBounded(inside(manifest.main), MAX_CODE_BYTES)) : null;
  return parsePackage(Buffer.from(JSON.stringify({ format: 1, manifest, code })), options);
}
function unpackPackage(pkg, dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(pkg.rawManifest), { flag: 'wx', mode: 0o600 });
  if (pkg.manifest.main) {
    const file = path.join(dir, pkg.manifest.main);
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, pkg.code, { flag: 'wx', mode: 0o600 });
  }
}
function describePackage(pkg, { locale = 'en', grant } = {}) {
  const m = pkg.manifest;
  return { id: m.id, version: m.version, name: localize(m.name, locale), description: localize(m.description, locale), author: m.author,
    identityIcon: m.identityIcon, icon: m.views[0]?.icon || 'dot',
    permissions: [...m.permissions], hosts: [...m.network.hosts], missing: missingGrant(m, grant), risk: riskSummary(m), hasCode: Boolean(m.main), sha256: pkg.hash };
}
module.exports = { MAX_PACKAGE_BYTES, ID_RE, digest, readBounded, parsePackage, packageDirectory, unpackPackage, describePackage };
