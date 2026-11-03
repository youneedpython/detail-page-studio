import { spawn } from 'node:child_process';
import { readFile, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

export class Stop extends Error {
  constructor(status, message, category) { super(message); this.status = status; this.category = category ?? classify(message); }
}
export function classify(message) {
  if (/quota|usage.limit|rate.limit/i.test(message)) return 'quota';
  if (/login|authentication|unauthorized/i.test(message)) return 'auth';
  if (/timeout/i.test(message)) return 'timeout';
  if (/EPERM|EACCES|sandbox|permission.denied|permission.denial/i.test(message)) return 'sandbox';
  if (/schema|malformed|contract|configuration/i.test(message)) return 'schema';
  if (/secret/i.test(message)) return 'secret';
  if (/path|changed_files|symlink|guard/i.test(message)) return 'guard';
  if (/verify/i.test(message)) return 'verify';
  return 'execution';
}
export const blocked = message => { throw new Stop('BLOCKED', message); };
export const readJson = async file => JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
const credentialPatterns = () => [
  ['private-key', /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g],
  ['bearer', /\bBearer\s+[^\s"']+/gi],
  ['key-format', /\b(?:sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,}|github_pat_[A-Za-z0-9_]{8,}|(?:AKIA|ASIA)[A-Z0-9]{16})\b/g],
  ['url-userinfo', /[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s/@:]*:[^\s/@]+@/g],
];
const assignmentPattern = () => /((?:["']?)(?:password|passwd|api[_-]?key|access[_-]?token|secret(?:[_-]?key)?|token)[A-Za-z0-9]*(?:[_-][A-Za-z0-9]+)*(?:["']?)\s*[:=]\s*)("[^"\r\n]*"|'[^'\r\n]*'|[^\s,}\r\n]+)/gi;
export function validateSecretAllow(items = []) {
  if (!Array.isArray(items) || items.length > 50 || new Set(items).size !== items.length) blocked('Contract allowlist invalid');
  for (const item of items) {
    if (typeof item !== 'string' || item.length < 3 || item.length > 200 || item.trim() !== item || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(item)) blocked('Contract allowlist format invalid');
    if (credentialPatterns().some(([, pattern]) => pattern.test(item))) blocked('Contract allowlist credential form rejected');
    if (/(?:password|passwd|api[_-]?key|access[_-]?token|secret(?:[_-]?key)?|token)[A-Za-z0-9]*(?:[_-][A-Za-z0-9]+)*(?:["']?)\s*(?:[:=]\s*)?$/i.test(item)) blocked('Contract allowlist incomplete assignment rejected');
  }
  return items;
}
export function scanCopy(text, items = [], serialized = false) {
  validateSecretAllow(items);
  const forms = [...new Set(items.map(item => serialized ? JSON.stringify(item).slice(1, -1) : item))].sort((a, b) => b.length - a.length || a.localeCompare(b));
  if (!forms.length) return String(text);
  const escaped = forms.map(item => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // One pass prevents replacement text becoming a subsequent literal match.
  return String(text).replace(new RegExp(escaped.join('|'), 'g'), (match, offset, input) => {
    const before = input[offset - 1], after = input[offset + match.length];
    const boundary = char => char === undefined || /[\s,;{}()[\]]/.test(char) || serialized && char === '"';
    return boundary(before) && boundary(after) ? ' [APPROVED LITERAL] ' : match;
  });
}
export function contractIdentity(value) {
  return createHash('sha256').update(JSON.stringify(Object.entries(value).filter(([key]) => key !== 'secret_scan_allow').sort(([a], [b]) => a.localeCompare(b)))).digest('hex');
}
export function resumeContract(frozenValue, currentValue, identity = contractIdentity(frozenValue)) {
  if (contractIdentity(currentValue) !== identity) blocked('Resume contract fields changed');
  validateSecretAllow(currentValue.secret_scan_allow);
  return { ...currentValue, secret_scan_allow: currentValue.secret_scan_allow ?? [] };
}
export async function resumeSourceRevision(root, revision, contract, identity = contractIdentity(contract)) {
  const head = (await git(root, ['rev-parse', 'HEAD'])).trim();
  if (head === revision) return head;
  const active = `harness/tasks/${contract.id}.json`;
  await git(root, ['merge-base', '--is-ancestor', revision, head]);
  const commits = (await git(root, ['rev-list', '--reverse', `${revision}..${head}`])).trim().split('\n');
  for (const commit of commits) {
    const parents = (await git(root, ['rev-list', '--parents', '-n', '1', commit])).trim().split(' ');
    if (parents.length !== 2) blocked('Resume contract history must be linear');
    const files = (await git(root, ['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', commit])).split('\0').filter(Boolean);
    if (files.length !== 1 || files[0] !== active) blocked('Resume history contains non-contract changes');
    let value;
    try { value = JSON.parse(await git(root, ['show', `${commit}:${active}`])); }
    catch { blocked('Resume contract history malformed'); }
    resumeContract(contract, value, identity);
  }
  if ((await changes(root)).length) blocked('Resume committed contract requires clean source');
  return head;
}
export function redact(value) {
  return String(value)
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, '[REDACTED PRIVATE KEY]')
    .replace(/\bBearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,}|github_pat_[A-Za-z0-9_]{8,}|(?:AKIA|ASIA)[A-Z0-9]{16})\b/g, '[REDACTED]')
    .replace(credentialPatterns()[3][1], '[REDACTED URL]')
    .replace(assignmentPattern(), '$1"[REDACTED]"');
}
export function sanitize(value) {
  if (typeof value === 'string') return redact(value);
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) =>
    [key, /^(?:password|passwd|api[_-]?key|access[_-]?token|secret(?:[_-]?key)?|token)$/i.test(key) || (item === null || typeof item !== 'object') && /(?:password|passwd|api[_-]?key|access[_-]?token|secret(?:[_-]?key)?|token)[A-Za-z0-9]*(?:[_-][A-Za-z0-9]+)*$/i.test(key) ? '[REDACTED]' : sanitize(item)]));
  return value;
}
export function validate(value, schema, at = '$') {
  const supported = new Set(['$schema', 'title', 'description', 'type', 'enum', 'const', 'required', 'properties', 'additionalProperties', 'items', 'uniqueItems', 'minItems', 'maxItems', 'minLength', 'maxLength', 'pattern']);
  for (const key of Object.keys(schema)) if (!supported.has(key)) blocked(`Unsupported schema keyword: ${key}`);
  const type = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
  if (schema.type && schema.type !== type) blocked(`Schema ${at}: expected ${schema.type}`);
  if (schema.enum && !schema.enum.includes(value)) blocked(`Schema ${at}: invalid enum`);
  if ('const' in schema && value !== schema.const) blocked(`Schema ${at}: invalid const`);
  if (type === 'object') {
    for (const key of schema.required ?? []) if (!Object.hasOwn(value, key)) blocked(`Schema ${at}: missing ${key}`);
    for (const [key, item] of Object.entries(value)) {
      if (schema.properties?.[key]) validate(item, schema.properties[key], `${at}.${key}`);
      else if (schema.additionalProperties === false) blocked(`Schema ${at}: unexpected ${key}`);
    }
  }
  if (type === 'array') {
    if (value.length > (schema.maxItems ?? Infinity)) blocked(`Schema ${at}: too many items`);
    if (value.length < (schema.minItems ?? 0)) blocked(`Schema ${at}: too few items`);
    if (schema.uniqueItems && new Set(value.map(x => JSON.stringify(x))).size !== value.length) blocked(`Schema ${at}: duplicate items`);
    if (schema.items) value.forEach((item, i) => validate(item, schema.items, `${at}[${i}]`));
  }
  if (type === 'string' && value.length < (schema.minLength ?? 0)) blocked(`Schema ${at}: empty string`);
  if (type === 'string' && value.length > (schema.maxLength ?? Infinity)) blocked(`Schema ${at}: string too long`);
  if (type === 'string' && schema.pattern && !new RegExp(schema.pattern).test(value)) blocked(`Schema ${at}: invalid pattern`);
}
export function commandCheck(command) {
  if (!Array.isArray(command) || !command.length || command.some(x => typeof x !== 'string' || !x || x.includes('\0'))) blocked('Command must be a nonempty string array');
  if (/\.(cmd|bat)$/i.test(command[0])) blocked('Use node + CLI JS entry instead of .cmd/.bat shim');
}
export async function processRun(command, { cwd, timeout, input = '', signal, env } = {}) {
  commandCheck(command);
  return new Promise(resolve => {
    let stdout = '', stderr = '', failure = null, finished = false, killer;
    let child;
    try { child = spawn(command[0], command.slice(1), { cwd, env, shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch (error) { resolve({ code: null, failure: `spawn: ${error.code ?? error.message}`, stdout, stderr }); return; }
    const kill = reason => {
      if (finished || failure) return;
      failure = reason;
      if (child.pid) {
        if (process.platform === 'win32') {
          killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', shell: false });
          killer.on('error', () => child.kill('SIGKILL'));
        } else { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }
      }
    };
    const abort = () => kill('interrupted');
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => kill('timeout'), timeout);
    const finish = code => {
      if (finished) return;
      finished = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      resolve({ code, failure, stdout, stderr });
    };
    child.on('error', error => { failure = `spawn: ${error.code ?? error.message}`; finish(null); });
    child.on('close', finish);
    for (const [stream, name] of [[child.stdout, 'stdout'], [child.stderr, 'stderr']]) {
      stream.setEncoding('utf8'); stream.on('data', chunk => {
        if (name === 'stdout') stdout += chunk; else stderr += chunk;
        if (Buffer.byteLength(stdout) > 8 * 1024 * 1024 || Buffer.byteLength(stderr) > 8 * 1024 * 1024) {
          stdout = stdout.slice(0, 8 * 1024 * 1024); stderr = stderr.slice(0, 8 * 1024 * 1024); kill('output_limit');
        }
      });
    }
    child.stdin.on('error', () => {});
    child.stdin.end(input);
    if (signal?.aborted) abort();
  });
}
export function requireSuccess(result, label, login = false) {
  if (result.code === 0 && !result.failure) return;
  if (label.toLowerCase() === 'verify') throw new Stop('BLOCKED', `${label}: ${result.failure ?? `exit ${result.code}`}`, 'verify');
  // Codex headers and echoed user prompts are context, not process diagnostics.
  const diagnostics = text => {
    let prompt = false;
    return String(text ?? '').split(/\r?\n/).filter(line => {
      if (/^user\s*$/.test(line)) { prompt = true; return false; }
      if (/^(?:thinking|assistant|codex|exec)\s*$/.test(line)) { prompt = false; return false; }
      return !prompt && !/^\s*(?:sandbox|model|approval)\s*:/i.test(line);
    }).join('\n');
  };
  const output = [diagnostics(result.stdout), diagnostics(result.stderr), result.failure ?? ''].join('\n');
  if (/quota|usage limit|rate limit|usage_limit/i.test(output)) blocked(`${label}: quota`);
  if (login || /^(?:\s*(?:error|fatal)(?:\s*:\s*|\s+))?\s*(?:not logged in|login required|authentication\s+(?:failed|failure|required)|unauthorized|(?:login|token)\s+(?:has\s+)?expired|expired.*(?:login|token))/im.test(output)) throw new Stop('HUMAN_REQUIRED', `${label}: login unconfirmed`, 'auth');
  if (/^(?:\s*(?:error|fatal)\s*:\s*)?\s*(?:spawn\s*:?\s*(?:EPERM|EACCES)\b|EPERM\b|EACCES\b|permission denied\b|sandbox\s+(?:permission denied|denied|refused)\b)/im.test(output)) blocked(`${label}: sandbox denial`);
  if (/^(?:\s*(?:error|fatal)\s*:\s*)?\s*(?:invalid_request_error\s*\/\s*)?invalid_json_schema\b|^\s*(?:error|fatal)\s*:\s*(?:malformed\s+(?:JSON|schema)|schema error)\b/im.test(output)) blocked(`${label}: schema error`);
  blocked(`${label}: ${result.failure ?? `exit ${result.code}`}`);
}
export function safePath(file, directory = false) {
  if (typeof file !== 'string' || !file || /[\\\0:*?"<>|]/.test(file) || path.posix.isAbsolute(file)) blocked('Invalid relative path');
  const parts = (directory ? file.replace(/\/$/, '') : file).split('/');
  if (parts.some(x => !x || x === '.' || x === '..') || parts[0].toLowerCase() === '.git') blocked(`Unsafe path: ${file}`);
  return file;
}
export async function inside(root, relative) {
  safePath(relative);
  const target = path.resolve(root, relative);
  const resolved = await realpath(target);
  const rel = path.relative(root, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) blocked('Path escapes repository');
  let current = root;
  for (const part of relative.split('/')) { current = path.join(current, part); if ((await lstat(current)).isSymbolicLink()) blocked(`Symlink: ${relative}`); }
  return target;
}
export function extractReviewer(stdout) {
  const envelope = JSON.parse(stdout);
  if (envelope.is_error || (envelope.permission_denials?.length ?? 0) > 0) blocked('Reviewer error or permission denial');
  if (typeof envelope.result !== 'string') blocked('Missing reviewer result string');
  const value = envelope.result.trim();
  try { return JSON.parse(value); } catch { /* scan complete top-level objects, respecting JSON strings */ }
  const objects = [];
  let start = -1, depth = 0, quoted = false, escaped = false;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (start < 0) { if (c === '{') { start = i; depth = 1; } continue; }
    if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; continue; }
    if (c === '"') quoted = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) { try { objects.push(JSON.parse(value.slice(start, i + 1))); } catch { /* invalid JSON */ } start = -1; }
  }
  if (objects.length !== 1 || start >= 0) blocked('Malformed or ambiguous reviewer JSON');
  return objects[0];
}
export async function git(root, args, signal) {
  const result = await processRun(['git', ...args], { cwd: root, timeout: 30000, signal });
  requireSuccess(result, 'git'); return result.stdout;
}
export async function changes(root, signal) {
  const raw = await git(root, ['status', '--porcelain=v1', '-z', '-uall', '--no-renames'], signal);
  const entries = raw.split('\0').filter(Boolean).map(row => ({ status: row.slice(0, 2), file: row.slice(3) }));
  return entries;
}
export async function snapshot(root, signal) {
  const entries = await changes(root, signal);
  let diff = await git(root, ['diff', 'HEAD', '--no-ext-diff', '--no-textconv', '--binary', '--'], signal);
  for (const entry of entries) {
    safePath(entry.file);
    // Check every existing changed path (including ancestors); deleted paths have no content.
    try {
      const target = await inside(root, entry.file);
      if (entry.status === '??') diff += `\n--- untracked: ${entry.file}\n${await readFile(target, 'utf8')}\n`;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return { entries, diff };
}
export function guard(snapshotValue, reported, contract) {
  const actual = snapshotValue.entries.map(x => x.file).sort();
  reported.forEach(x => safePath(x));
  if (JSON.stringify(actual) !== JSON.stringify([...reported].sort())) blocked('changed_files mismatch');
  const match = (file, rule) => {
    if (process.platform === 'win32') { file = file.toLowerCase(); rule = rule.toLowerCase(); }
    return rule.endsWith('/') ? file.startsWith(rule) : file === rule;
  };
  for (const file of actual) if (contract.forbidden_paths.some(rule => match(file, rule)) || !contract.allowed_paths.some(rule => match(file, rule))) blocked(`Path violation: ${file}`);
  if (contract.id && actual.some(file => match(file, `harness/tasks/${contract.id}.json`))) blocked('Guard: active Task Contract modification forbidden');
  if (actual.some(secretFile)) blocked('Secret file detected');
  // Check introduced lines, not old/context lines containing deliberate test fixtures.
  // Untracked content has no '+' prefix and must be checked in full.
  const [tracked, ...untracked] = (snapshotValue.diff ?? '').split('\n--- untracked: ');
  const added = tracked.split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++')).map(line => line.slice(1)).join('\n');
  const introduced = [added, ...untracked].join('\n');
  if (/\?{3,}|\uFFFD/u.test(introduced)) blocked('Guard: encoding corruption detected');
  try { assertNoSecrets(introduced, contract.secret_scan_allow, 'guard-added-lines'); }
  catch (error) {
    if (!error.locations) throw error;
    // Map scanner lines back to new-file coordinates without recording content.
    const coordinates = [];
    let file = 'diff', line = 0;
    for (const row of tracked.split('\n')) {
      if (row.startsWith('+++ b/')) file = row.slice(6);
      const hunk = /^@@ .* \+(\d+)/.exec(row);
      if (hunk) line = Number(hunk[1]);
      else if (row.startsWith('+') && !row.startsWith('+++')) coordinates.push({ source: file, line: line++ });
      else if (row.startsWith(' ')) line++;
    }
    if (!coordinates.length) coordinates.push({ source: 'diff', line: 0 });
    for (const chunk of untracked) {
      const [name, ...rows] = chunk.split('\n');
      coordinates.push({ source: name, line: 0 });
      rows.forEach((row, index) => coordinates.push({ source: name, line: index + 1 }));
    }
    error.locations = error.locations.map(location => ({ ...location, ...(coordinates[location.line - 1] ?? {}) }));
    throw error;
  }
}

export function secretFile(file) {
  return /(?:^|\/)(?:\.env(?:\..*)?|credentials(?:\.json)?|id_(?:rsa|ed25519)|[^/]+\.(?:pem|p12|pfx))$/i.test(file) && !/\.env\.example$/i.test(file);
}

export function assertNoSecrets(text, items = [], source = 'input', serialized = false) {
  const copy = scanCopy(text, items, serialized);
  if (redact(copy) !== copy) {
    const error = new Stop('BLOCKED', 'Secret-like input detected (content withheld)', 'secret');
    error.locations = [...credentialPatterns(), ['assignment', assignmentPattern()]].flatMap(([rule, pattern]) => [...copy.matchAll(pattern)].map(match => ({ source, line: copy.slice(0, match.index).split('\n').length, rule })));
    throw error;
  }
}

export async function ignoredSecrets(root) {
  const raw = await git(root, ['ls-files', '--others', '--ignored', '--exclude-standard', '-z', '--', '.env*', '**/.env*', '*.pem', '**/*.pem', '*.p12', '**/*.p12', '*.pfx', '**/*.pfx', '**/credentials.json', '**/id_rsa', '**/id_ed25519']);
  return raw.split('\0').filter(Boolean).filter(secretFile);
}
