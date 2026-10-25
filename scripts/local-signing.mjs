// A project-local, certificate-bound identity survives development rebuilds.
// It is not a Developer ID certificate and does not change system trust settings.
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, access, chmod, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

export async function localSigning(root) {
  const directory = path.join(root, '.local-signing');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const keychain = path.join(directory, 'canvaspilot.keychain-db');
  const passwordFile = path.join(directory, 'password');
  const certificate = path.join(directory, 'certificate.pem');
  const key = path.join(directory, 'private-key.pem');
  const p12 = path.join(directory, 'identity.p12');
  const run = (bin, args) => {
    try { return execFileSync(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }); }
    catch (error) {
      // Node's default child-process error includes arguments, including passwords.
      throw new Error(`${path.basename(bin)} failed during local signing (exit ${error.status ?? 'unknown'}). Check the local keychain and signing setup.`);
    }
  };
  let password;
  try { password = (await readFile(passwordFile, 'utf8')).trim(); }
  catch (error) { if (error.code !== 'ENOENT') throw error; password = randomBytes(32).toString('hex'); await writeFile(passwordFile, password, { mode: 0o600 }); }
  try { await access(keychain); }
  catch {
    const config = path.join(directory, 'certificate.cnf');
    await writeFile(config, '[req]\ndistinguished_name=dn\nx509_extensions=extensions\nprompt=no\n[dn]\nCN=CanvasPilot Local Development\n[extensions]\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=critical,codeSigning\n', { mode: 0o600 });
    run('/usr/bin/openssl', ['req', '-new', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '3650', '-config', config, '-keyout', key, '-out', certificate]);
    await chmod(key, 0o600);
    run('/usr/bin/openssl', ['pkcs12', '-export', '-inkey', key, '-in', certificate, '-out', p12, '-passout', `file:${passwordFile}`]);
    await chmod(p12, 0o600);
    const searchList = [...run('/usr/bin/security', ['list-keychains', '-d', 'user']).matchAll(/"([^"]+)"/g)].map(match => match[1]);
    try { run('/usr/bin/security', ['create-keychain', '-p', password, keychain]); }
    finally { run('/usr/bin/security', ['list-keychains', '-d', 'user', '-s', ...searchList]); }
    run('/usr/bin/security', ['unlock-keychain', '-p', password, keychain]);
    run('/usr/bin/security', ['import', p12, '-k', keychain, '-P', password, '-T', '/usr/bin/codesign']);
    run('/usr/bin/security', ['set-key-partition-list', '-S', 'apple-tool:,apple:,codesign:', '-s', '-k', password, keychain]);
    await rm(key); await rm(p12);
  }
  run('/usr/bin/security', ['unlock-keychain', '-p', password, keychain]);
  const fingerprint = run('/usr/bin/openssl', ['x509', '-in', certificate, '-noout', '-fingerprint', '-sha1']).trim().split('=')[1].replaceAll(':', '');
  return { keychain, fingerprint };
}
