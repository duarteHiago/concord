// Ferramentas de administração para quem hospeda o Concord.
//   docker compose exec app node src/cli.ts reset-password <usuário>
//   docker compose exec app node src/cli.ts users
//   docker compose exec app node src/cli.ts disable-2fa <usuário>
//   docker compose exec app node src/cli.ts backup
import bcrypt from 'bcryptjs';
import { backupNow, listBackups } from './backup.ts';
import { all, get, run, type UserRow } from './db.ts';
import { temporaryPassword } from './recovery.ts';
import { disable as disableTwoFactor } from './twoFactor.ts';

const [command, arg] = process.argv.slice(2);

if (command === 'reset-password' && arg) {
  const user = get<UserRow>('SELECT * FROM users WHERE username = ?', arg);
  if (!user) {
    console.error(`Usuário "${arg}" não encontrado.`);
    process.exit(1);
  }
  const password = temporaryPassword();
  // sobe a versão do token: quem estava logado com a senha antiga sai da conta
  run('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?', await bcrypt.hash(password, 10), user.id);
  console.log(`Senha de @${user.username} redefinida.`);
  console.log(`Senha temporária: ${password}`);
  console.log('Peça para a pessoa trocar em Configurações > Conta assim que entrar.');
} else if (command === 'disable-2fa' && arg) {
  // para quem perdeu o celular e os códigos de backup (confira que é a pessoa antes!)
  const user = get<UserRow>('SELECT * FROM users WHERE username = ?', arg);
  if (!user) {
    console.error(`Usuário "${arg}" não encontrado.`);
    process.exit(1);
  }
  disableTwoFactor(user.id);
  console.log(`Verificação em duas etapas de @${user.username} desligada. A pessoa entra só com a senha e pode ligar de novo em Configurações > Conta.`);
} else if (command === 'users') {
  for (const u of all<UserRow>('SELECT * FROM users ORDER BY created_at')) {
    console.log(`@${u.username}  (${u.display_name})  criado em ${new Date(u.created_at).toLocaleString('pt-BR')}`);
  }
} else if (command === 'backup') {
  console.log(`Backup feito: ${await backupNow()}`);
  for (const b of listBackups()) console.log(`  ${b.day}  ${(b.size / 1024 / 1024).toFixed(1)} MB`);
} else {
  console.log('Uso:');
  console.log('  node src/cli.ts reset-password <usuário>   gera uma senha temporária');
  console.log('  node src/cli.ts users                      lista as contas');
  console.log('  node src/cli.ts disable-2fa <usuário>      desliga a verificação em duas etapas');
  console.log('  node src/cli.ts backup                     faz o backup do banco agora (data/backups/)');
  process.exit(command ? 1 : 0);
}
