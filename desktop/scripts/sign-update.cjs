// No CI, depois do electron-builder: assina o instalador (ver update-signature.cjs) e grava o .sig ao lado.
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
  const file = path.join(__dirname, '..', 'release', `Concord-Setup-${version}.exe`);
  const sha512 = await sha512File(file);
  const signature = sign(key, version, sha512);
  // confere com a chave pública que vai dentro do app: chave trocada aqui quebraria todas as atualizações
  const publicKey = fs.readFileSync(path.join(__dirname, '..', 'update-key.pub'), 'utf8');
  if (!verify(publicKey, version, sha512, signature)) {
    console.error('A chave privada não corresponde a desktop/update-key.pub.');
    process.exit(1);
  }
  fs.writeFileSync(`${file}.sig`, signature);
  const fingerprint = crypto.createHash('sha256').update(publicKey).digest('hex').slice(0, 16);
  console.log(`Assinado: ${path.basename(file)} (versão ${version}, chave ${fingerprint})`);
})();
