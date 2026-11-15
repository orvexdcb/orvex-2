import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const version = process.env.ORVEX_RELEASE_VERSION || process.argv[2] || '';
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error('ORVEX_RELEASE_VERSION must be a valid SemVer value, e.g. 1.2.3');
}
const root = process.cwd();
fs.writeFileSync(`${root}/orvex-build.js`, `/* Generated immutable ORVEX build marker. */\nwindow.ORVEX_BUILD_VERSION = ${JSON.stringify(version)};\n`);
const swPath = `${root}/sw.js`;
let swSource = fs.readFileSync(swPath, 'utf8');
swSource = swSource.replace(/^const VER=.*;$/m, `const VER='orvex-release-${version}';`);
if (!/^const VER=.*;$/m.test(swSource)) throw new Error('Could not set release-specific Service Worker cache version');
fs.writeFileSync(swPath, swSource);
const zipPath = `${root}/orvex-release.zip`;
try { fs.unlinkSync(zipPath); } catch {}
const exclusions = ['.git/*', '*/.git/*', 'node_modules/*', '*/node_modules/*', 'tests/*', '.github/*', 'scripts/*', '.env', '.env.*', '*/.env', '*/.env.*', '.vercel/*', '*/.vercel/*', '.supabase/*', '*.pem', '*.key', '*.p12', '*.pfx', '*.keystore', 'secrets/*', '*/secrets/*', 'orvex-release.zip', 'orvex-release.json'];
const zipArgs = ['-qr', zipPath, '.', '-x', ...exclusions];
const result = spawnSync('zip', zipArgs, { cwd: root, encoding: 'utf8' });
if (result.status !== 0) throw new Error(result.stderr || 'zip command failed');
const listing = spawnSync('unzip', ['-Z1', zipPath], { cwd: root, encoding: 'utf8' });
if (listing.status !== 0) throw new Error(listing.stderr || 'could not inspect release archive');
const forbidden = listing.stdout.split(/\r?\n/).filter(name => /(^|\/)\.env(?:\.|$)/i.test(name) || /(^|\/)\.vercel\//i.test(name) || /(^|\/)\.git\//i.test(name) || /\.(?:pem|key|p12|pfx|keystore)$/i.test(name) || /(^|\/)secrets\//i.test(name));
if (forbidden.length) { fs.unlinkSync(zipPath); throw new Error(`Sensitive files found in release archive: ${forbidden.slice(0, 5).join(', ')}`); }
const bytes = fs.readFileSync(zipPath);
const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
const manifest = { product: 'ORVEX', version, artifact: 'orvex-release.zip', sha256, size_bytes: bytes.length, created_at: new Date().toISOString(), delivery_mode: 'staged-vercel-deployment' };
fs.writeFileSync(`${root}/orvex-release.json`, JSON.stringify(manifest, null, 2) + '\n');
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `sha256=${sha256}\nsize_bytes=${bytes.length}\n`);
console.log(JSON.stringify({ version, sha256, size_bytes: bytes.length }, null, 2));
