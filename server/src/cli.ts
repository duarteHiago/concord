// Ferramentas de administração para quem hospeda o Concord.
//   docker compose exec app node src/cli.ts reset-password <usuário>
//   docker compose exec app node src/cli.ts users
import bcrypt from 'bcryptjs';
import { all, get, run, type UserRow } from './db.ts';
import { temporaryPassword } from './recovery.ts';

const [command, arg] = process.argv.slice(2);

if (command === 'reset-password' && arg) {
  const user = get<UserRow>('SELECT * FROM users WHERE username = ?', arg);
  if (!user) {
    console.error(`Usuário "${arg}" não encontrado.`);
    process.exit(1);
  }
  const password = temporaryPassword();
  run('UPDATE users SET password_hash = ? WHERE id = ?', await bcrypt.hash(password, 10), user.id);
  console.log(`Senha de @${user.username} redefinida.`);
  console.log(`Senha temporária: ${password}`);
  console.log('Peça para a pessoa trocar em Configurações > Conta assim que entrar.');
} else if (command === 'users') {
  for (const u of all<UserRow>('SELECT * FROM users ORDER BY created_at')) {
    console.log(`@${u.username}  (${u.display_name})  criado em ${new Date(u.created_at).toLocaleString('pt-BR')}`);
  }
} else {
  console.log('Uso:');
  console.log('  node src/cli.ts reset-password <usuário>   gera uma senha temporária');
  console.log('  node src/cli.ts users                      lista as contas');
  process.exit(command ? 1 : 0);
}
