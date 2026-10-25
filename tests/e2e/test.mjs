// Dois navegadores entram na mesma sala: verifica que um ouve o outro
// e que a transmissão de tela chega a quem clica em "Assistir".
import net from 'node:net';
import { chromium } from 'playwright';

// Serve o app como http://localhost dentro do container: o Chrome só libera
// microfone e captura de tela em contexto seguro (HTTPS ou localhost).
net
  .createServer((c) => {
    const s = net.connect(3000, 'app');
    c.pipe(s).pipe(c);
    c.on('error', () => s.destroy());
    s.on('error', () => c.destroy());
  })
  .listen(3000, '127.0.0.1');

const APP = 'http://localhost:3000';
const failures = [];
const check = (ok, label) => {
  console.log(`${ok ? '✔' : '✘'} ${label}`);
  if (!ok) failures.push(label);
};

async function waitForApp() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${APP}/health`)).ok) return;
    } catch {
      // ainda subindo
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('App não respondeu em 60s');
}

const post = (p, b, t) =>
  fetch(`${APP}/api${p}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
    body: JSON.stringify(b),
  }).then((r) => r.json());

await waitForApp();
const rnd = Math.random().toString(36).slice(2, 7);
const A = await post('/auth/register', { username: `ana${rnd}`, password: '123456', displayName: 'Ana' });
const B = await post('/auth/register', { username: `bia${rnd}`, password: '123456', displayName: 'Bia' });
const server = await post('/servers', { name: 'E2E' }, A.token);
const invite = await post(`/servers/${server.id}/invites`, {}, A.token);
await post(`/invites/${invite.code}`, {}, B.token);

const args = [
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  '--auto-select-desktop-capture-source=Entire screen',
  '--autoplay-policy=no-user-gesture-required',
];

// o que a Content-Security-Policy (por enquanto só relatório, ver server/src/security.ts) bloquearia:
// tem que ficar vazio, senão ligar a CSP para valer quebraria a voz ou a transmissão
const cspViolations = new Set();

async function open(name, token) {
  const browser = await chromium.launch({ args });
  // no contexto (e não na página) para valer também na janela separada da transmissão
  const context = await browser.newContext();
  await context.exposeFunction('cspViolation', (v) => cspViolations.add(`[${name}] ${v}`));
  await context.addInitScript(() =>
    document.addEventListener('securitypolicyviolation', (e) =>
      window.cspViolation(`${e.effectiveDirective} ${e.blockedURI.replace(/\?.*$/, '')} em ${location.pathname}`),
    ),
  );
  const page = await context.newPage();
  page.on('console', (m) => m.type() === 'error' && console.log(`  [${name}] ${m.text().slice(0, 200)}`));
  await page.addInitScript((t) => localStorage.setItem('concord.token', t), token);
  await page.goto(APP);
  // conta nova: fecha o tutorial de boas-vindas antes de interagir com o app
  const onboarding = page.getByRole('dialog', { name: 'Tutorial do Concord' });
  if (await onboarding.waitFor({ timeout: 3000 }).then(() => true, () => false)) {
    await page.getByRole('button', { name: /Pular|Fechar/ }).first().click();
  }
  await page.getByText('Sala de Transmissão').first().click();
  return { browser, page };
}

const liveAudios = (page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll('audio')].filter(
        (el) => !el.paused && el.srcObject?.getAudioTracks().some((t) => t.readyState === 'live'),
      ).length,
  );

const a = await open('A', A.token);
const b = await open('B', B.token);
let exitCode = 1;
try {
  await a.page.getByRole('button', { name: 'Sair da sala' }).first().waitFor({ timeout: 20000 });
  await b.page.getByRole('button', { name: 'Sair da sala' }).first().waitFor({ timeout: 20000 });
  await a.page.waitForTimeout(4000);
  check((await liveAudios(a.page)) >= 1, 'A ouve B');
  check((await liveAudios(b.page)) >= 1, 'B ouve A');

  await a.page.getByTitle('Transmitir tela').click();
  await a.page.getByRole('button', { name: /Escolher tela ou janela/ }).click();
  const watch = b.page.getByRole('button', { name: /Assistir/ });
  await watch.waitFor({ timeout: 20000 }).catch(() => {});
  check((await watch.count()) > 0, 'B vê a transmissão de A');
  if (await watch.count()) {
    await watch.first().click();
    await b.page.waitForTimeout(5000);
    const playing = await b.page.evaluate(
      () => [...document.querySelectorAll('video')].filter((v) => v.videoWidth > 0 && !v.paused).length,
    );
    check(playing >= 1, 'B recebe o vídeo da tela de A');

    // transmissão desacoplada em outra janela
    const popupPromise = b.page.waitForEvent('popup', { timeout: 10000 }).catch(() => null);
    await b.page.locator('[aria-label^="Abrir em outra janela"]').first().click();
    const popup = await popupPromise;
    if (popup) await popup.waitForTimeout(2500);
    const popupPlaying = popup
      ? await popup.evaluate(() => [...document.querySelectorAll('video')].some((v) => v.videoWidth > 0 && !v.paused))
      : false;
    check(popupPlaying, 'B abre a transmissão em outra janela');

    // B começa a transmitir também: a própria tela vai para o destaque e a janela separada
    // não pode congelar (o LiveKit precisa saber que ela está exibindo o vídeo)
    if (popup) {
      const frames = () => popup.evaluate(() => document.querySelector('video')?.getVideoPlaybackQuality().totalVideoFrames ?? -1);
      await b.page.getByTitle('Transmitir tela').click();
      await b.page.getByRole('button', { name: /Escolher tela ou janela/ }).click();
      await b.page.waitForTimeout(8000);
      const f0 = await frames();
      await popup.waitForTimeout(4000);
      check((await frames()) > f0, 'janela separada não congela quando B também transmite');
      await b.page.getByRole('button', { name: 'Parar transmissão' }).click().catch(() => {});
    }
    await popup?.close();
  }

  // clicar num participante da sala abre o perfil dele
  await b.page.getByRole('button', { name: 'Ver todos em grade' }).click().catch(() => {});
  await b.page.locator('[title^="Clique para ver o perfil"]').first().click();
  check(await b.page.getByText('Membro desde').isVisible().catch(() => false), 'clicar no participante abre o perfil');
  for (const v of cspViolations) console.log(`  CSP bloquearia: ${v}`);
  check(cspViolations.size === 0, 'nada esbarra na Content-Security-Policy');
  exitCode = failures.length ? 1 : 0;
} catch (err) {
  console.log('✘ erro:', err.message);
} finally {
  await a.browser.close();
  await b.browser.close();
}
console.log(failures.length || exitCode ? `\nFALHOU (${failures.length} verificação(ões))` : '\nTudo certo.');
process.exit(exitCode);
