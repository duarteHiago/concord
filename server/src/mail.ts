// E-mails do Concord (confirmar o endereço e recuperar a senha), enviados pela API transacional do Brevo.
// O e-mail é opcional: sem BREVO_API_KEY e MAIL_FROM, a função não aparece no app.
import { config } from './config.ts';

// (o endereço só muda nos testes, para não mandar e-mail de verdade)
const API_URL = process.env.BREVO_API_URL || 'https://api.brevo.com/v3/smtp/email';

export const mailEnabled = () => !!(config.mail.brevoKey && config.mail.from && config.publicUrl);

/** Formato básico; a confirmação de verdade é o link que chega na caixa de entrada. */
export const isEmail = (s: string) => s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

/** "fulano@gmail.com" -> "fu•••@gmail.com" (para avisos, sem expor o endereço inteiro). */
export function maskEmail(email: string) {
  const [name, domain] = email.split('@');
  return `${name.slice(0, 2)}•••@${domain}`;
}

const escapeHtml = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

interface Mail {
  subject: string;
  lines: string[];
  button?: { label: string; url: string };
  footer: string;
}

function html({ subject, lines, button, footer }: Mail) {
  const p = (t: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#3b3442">${escapeHtml(t)}</p>`;
  const btn = button
    ? `<p style="margin:22px 0"><a href="${escapeHtml(button.url)}" style="display:inline-block;padding:12px 24px;border-radius:999px;background:#ff8a6b;color:#2a1410;font-weight:700;font-size:15px;text-decoration:none">${escapeHtml(button.label)}</a></p>
<p style="margin:0 0 14px;font-size:12px;line-height:1.5;color:#7a7183">Se o botão não abrir, copie este endereço no navegador:<br><span style="word-break:break-all">${escapeHtml(button.url)}</span></p>`
    : '';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:24px 12px;background:#f4f1f6;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px 28px">
<img src="${escapeHtml(config.publicUrl)}/brand/concord-logo.png" alt="Concord" height="32" style="display:block;height:32px;margin-bottom:24px">
<h1 style="margin:0 0 16px;font-size:20px;color:#1d1722">${escapeHtml(subject)}</h1>
${lines.map(p).join('\n')}
${btn}
<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #ece7ef;font-size:12px;line-height:1.5;color:#7a7183">${escapeHtml(footer)}</p>
</div></body></html>`;
}

const text = ({ lines, button, footer }: Mail) => [...lines, ...(button ? [`${button.label}: ${button.url}`] : []), '', footer].join('\n\n');

async function send(to: string, mail: Mail) {
  const res = await fetch(API_URL, {
    signal: AbortSignal.timeout(10_000),
    method: 'POST',
    headers: { 'api-key': config.mail.brevoKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: config.mail.fromName, email: config.mail.from },
      to: [{ email: to }],
      subject: mail.subject,
      htmlContent: html(mail),
      textContent: text(mail),
    }),
  });
  if (!res.ok) throw new Error(`Brevo respondeu ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
}

const NOT_YOU = 'Se não foi você, pode ignorar este e-mail: nada muda na sua conta.';

export const sendVerifyEmail = (to: string, username: string, url: string) =>
  send(to, {
    subject: 'Confirme seu e-mail no Concord',
    lines: [`Oi, @${username}! Este e-mail foi cadastrado na sua conta do Concord para recuperar a senha se você esquecer.`, 'Confirme clicando no botão abaixo. O link vale por 24 horas.'],
    button: { label: 'Confirmar e-mail', url },
    footer: NOT_YOU,
  });

export const sendResetEmail = (to: string, username: string, url: string) =>
  send(to, {
    subject: 'Redefinir sua senha do Concord',
    lines: [`Oi, @${username}! Pediram para redefinir a senha da sua conta do Concord.`, 'Para escolher uma senha nova, clique no botão abaixo. O link vale por 30 minutos e só funciona uma vez.'],
    button: { label: 'Escolher nova senha', url },
    footer: 'Se não foi você, ignore este e-mail: sua senha continua a mesma.',
  });

export const sendPasswordChanged = (to: string, username: string) =>
  send(to, {
    subject: 'Sua senha do Concord foi alterada',
    lines: [`Oi, @${username}! A senha da sua conta do Concord acabou de ser trocada, e os outros aparelhos conectados foram desconectados.`],
    button: { label: 'Abrir o Concord', url: config.publicUrl },
    footer: 'Se não foi você, use "Esqueci minha senha" na tela de login agora mesmo para recuperar a conta.',
  });

export const sendEmailChanged = (to: string, username: string, newEmail: string | null) =>
  send(to, {
    subject: 'O e-mail da sua conta do Concord mudou',
    lines: [
      newEmail
        ? `Oi, @${username}! O e-mail de recuperação da sua conta do Concord foi trocado para ${maskEmail(newEmail)}. Este endereço não recebe mais os links de recuperação.`
        : `Oi, @${username}! Este e-mail foi removido da sua conta do Concord e não recebe mais os links de recuperação.`,
    ],
    footer: 'Se não foi você, entre na conta, troque a senha e cadastre o e-mail de novo em Configurações > Conta.',
  });
