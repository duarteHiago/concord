// Assinatura das atualizações do app desktop (Ed25519).
//
// O instalador vem de <servidor>/downloads/, e o servidor é o que estiver configurado no app. Sem assinatura,
// quem controlasse esse endereço (a VPS invadida, ou uma página que chamasse setServer) instalaria o que
// quisesse no PC de todo mundo. O CI assina "versão + SHA-512 do instalador" com a chave privada (segredo
// DESKTOP_UPDATE_KEY) e publica o .sig ao lado; o app só instala o que confere com a chave pública que vem
// dentro dele (update-key.pub). A versão entra na assinatura para ninguém servir um instalador antigo
// (legítimo, mas com falhas conhecidas) como se fosse novo.
const crypto = require('node:crypto');
const fs = require('node:fs');

const message = (version, sha512) => Buffer.from(`concord-update\n${version}\n${sha512}`);

function sha512File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha512');
    fs.createReadStream(file)
      .on('data', (d) => hash.update(d))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });
}

/** Assina (no CI). Devolve a assinatura em base64, que vai para <instalador>.sig. */
const sign = (privateKeyPem, version, sha512) => crypto.sign(null, message(version, sha512), privateKeyPem).toString('base64');

/** Confere (no app). Qualquer coisa fora do formato é "não confere". */
function verify(publicKeyPem, version, sha512, signatureB64) {
  try {
    return crypto.verify(null, message(version, sha512), publicKeyPem, Buffer.from(String(signatureB64).trim(), 'base64'));
  } catch {
    return false;
  }
}

module.exports = { sha512File, sign, verify };
