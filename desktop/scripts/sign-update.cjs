// No CI, depois do electron-builder: assina cada instalador encontrado e grava o .sig ao lado.
//   DESKTOP_UPDATE_KEY=<chave privada em PEM> node scripts/sign-update.cjs
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { sha512File, sign, verify } = require('../update-signature.cjs');

const key = process.env.DESKTOP_UPDATE_KEY;
if (!key) {
  console.error('Falta o segredo DESKTOP_UPDATE_KEY: sem assinatura, os apps recusam a atualização.');
  process.exit(1);
}

(async () => {
  const { version } = require('../package.json');
  const releaseDir = path.join(__dirname, '..', 'release');
  const publicKey = fs.readFileSync(path.join(__dirname, '..', 'update-key.pub'), 'utf8');
  const fingerprint = crypto.createHash('sha256').update(publicKey).digest('hex').slice(0, 16);

  const candidates = [
    `Concord-Setup-${version}.exe`,
    `Concord-${version}.dmg`,
    `Concord-${version}-mac.zip`,
    `Concord-${version}.zip`,
  ];

  let signed = 0;
  for (const name of candidates) {
    const file = path.join(releaseDir, name);
    if (!fs.existsSync(file)) continue;

    const sha512 = await sha512File(file);
    const signature = sign(key, version, sha512);
    if (!verify(publicKey, version, sha512, signature)) {
      console.error(`A chave privada não corresponde a desktop/update-key.pub (arquivo: ${name}).`);
      process.exit(1);
    }
    fs.writeFileSync(`${file}.sig`, signature);
    console.log(`Assinado: ${name} (versão ${version}, chave ${fingerprint})`);
    signed++;
  }

  if (signed === 0) {
    console.error('Nenhum instalador encontrado para assinar.');
    process.exit(1);
  }
})();
