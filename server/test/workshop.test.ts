// Oficina do servidor: o validador recusa o que não está no esquema, só quem gerencia mexe no rascunho e
// publica, membros só veem o publicado, e fora do Concord de testes as rotas nem existem.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { defaultProps, defaultScreen, defaultTheme, emptyWorkshop, installPack, parseWorkshop, type WorkshopConfig } from '../../shared/workshop.ts';
import { signUp, startServer, type TestServer } from './helpers.ts';

const NOW = Date.UTC(2026, 10, 10);

function withWidgets(...widgets: unknown[]) {
  return { ...emptyWorkshop(), mural: { title: 'Mural', widgets } };
}
const placed = (type: string, extra: Record<string, unknown> = {}) => ({
  id: `w-${type}`,
  type,
  x: 0,
  y: 0,
  w: 2,
  h: 2,
  props: defaultProps(type as 'text'),
  ...extra,
});

describe('validador da Oficina', () => {
  it('aceita a configuração vazia e um pacote instalado', () => {
    assert.equal(parseWorkshop(emptyWorkshop(), NOW).ok, true);
    const r = parseWorkshop(installPack(emptyWorkshop(), 'runas'), NOW);
    assert.equal(r.ok, true);
    assert.equal(r.ok && r.value.pieces.intro, 'runas');
  });

  it('recusa chaves desconhecidas em qualquer nível', () => {
    assert.match((parseWorkshop({ ...emptyWorkshop(), customCss: 'body{}' }, NOW) as { error: string }).error, /chave desconhecida "customCss"/);
    assert.equal(parseWorkshop({ ...emptyWorkshop(), pieces: { cursor: 'runas' } }, NOW).ok, false);
    const w = placed('text', { props: { title: 'a', body: 'b', tone: 'plain', html: '<b>x</b>' } });
    assert.match((parseWorkshop(withWidgets(w), NOW) as { error: string }).error, /chave desconhecida "html"/);
  });

  it('recusa pacote, widget e fuso fora da lista', () => {
    assert.equal(parseWorkshop({ ...emptyWorkshop(), pieces: { icon: 'riot' } }, NOW).ok, false);
    assert.equal(parseWorkshop(withWidgets(placed('iframe')), NOW).ok, false);
    assert.equal(parseWorkshop(withWidgets(placed('clock', { w: 2, h: 1, props: { title: 'x', tz: 'Mars/Olympus' } })), NOW).ok, false);
  });

  it('recusa versão desconhecida', () => {
    assert.equal(parseWorkshop({ ...emptyWorkshop(), version: 2 }, NOW).ok, false);
  });

  it('confere a grade: tamanho, limites e sobreposição', () => {
    assert.equal(parseWorkshop(withWidgets(placed('text', { x: 5, w: 3 })), NOW).ok, false, 'passa da última coluna');
    assert.equal(parseWorkshop(withWidgets(placed('clock', { w: 6, h: 1, props: defaultProps('clock') })), NOW).ok, false, 'maior que o máximo');
    assert.equal(parseWorkshop(withWidgets(placed('text', { x: 1.5 })), NOW).ok, false, 'posição quebrada');
    const a = placed('text');
    const b = { ...placed('rules'), x: 1, y: 1 };
    assert.match((parseWorkshop(withWidgets(a, b), NOW) as { error: string }).error, /em cima de outro/);
    assert.equal(parseWorkshop(withWidgets(a, { ...b, x: 2, y: 0 }), NOW).ok, true, 'lado a lado pode');
    assert.equal(parseWorkshop(withWidgets(a, { ...placed('rules'), id: 'w-text' , x: 2 }), NOW).ok, false, 'id repetido');
  });

  it('só aceita links https e imagens da própria Oficina', () => {
    const link = (url: string) => placed('links', { props: { title: 'Links', items: [{ label: 'Site', url }] } });
    assert.equal(parseWorkshop(withWidgets(link('https://exemplo.com/a')), NOW).ok, true);
    assert.equal(parseWorkshop(withWidgets(link('javascript:alert(1)')), NOW).ok, false);
    assert.equal(parseWorkshop(withWidgets(link('http://exemplo.com')), NOW).ok, false);
    assert.equal(parseWorkshop(withWidgets(link('https://user:senha@exemplo.com')), NOW).ok, false);
    const img = (url: string) => placed('image', { props: { url, caption: '', fit: 'cover' } });
    assert.equal(parseWorkshop(withWidgets(img('/uploads/workshop/abc-123.png')), NOW).ok, true);
    assert.equal(parseWorkshop(withWidgets(img('https://evil.example/pixel.png')), NOW).ok, false);
    assert.equal(parseWorkshop(withWidgets(img('/uploads/avatars/abc-123.png')), NOW).ok, false);
  });

  it('recusa textos longos demais e caracteres que disfarçam texto', () => {
    const t = (body: string) => placed('text', { props: { title: 'Aviso', body, tone: 'plain' } });
    assert.equal(parseWorkshop(withWidgets(t('linha 1\nlinha 2')), NOW).ok, true);
    assert.equal(parseWorkshop(withWidgets(t('x'.repeat(601))), NOW).ok, false);
    assert.equal(parseWorkshop(withWidgets(t('abc‮gpj.exe')), NOW).ok, false);
    assert.equal(parseWorkshop(withWidgets(placed('rules', { props: { title: 'a\nb', items: [] } })), NOW).ok, false, 'título não tem quebra de linha');
  });

  it('tela em grade livre: blocos obrigatórios, sem sobreposição, dentro da grade', () => {
    const withScreen = (items: unknown[]) => ({ ...emptyWorkshop(), screen: { items } });
    assert.equal(parseWorkshop(withScreen(defaultScreen()), NOW).ok, true, 'o layout padrão vale');
    const noMain = defaultScreen().filter((b) => b.id !== 'main');
    assert.match((parseWorkshop(withScreen(noMain), NOW) as { error: string }).error, /obrigatório/);
    const noMembers = defaultScreen().filter((b) => b.id !== 'members');
    assert.equal(parseWorkshop(withScreen(noMembers), NOW).ok, true, 'membros é opcional');
    const widget = { ...placed('online'), x: 10, y: 0, w: 2, h: 2 };
    assert.equal(parseWorkshop(withScreen([...noMembers, widget]), NOW).ok, true, 'widget no lugar dos membros');
    assert.equal(parseWorkshop(withScreen([...defaultScreen(), widget]), NOW).ok, false, 'em cima dos membros');
    const tinyMain = defaultScreen().map((b) => (b.id === 'main' ? { ...b, w: 2 } : b));
    assert.equal(parseWorkshop(withScreen(tinyMain), NOW).ok, false, 'conversa menor que o mínimo');
    const offGrid = defaultScreen().map((b) => (b.id === 'members' ? { ...b, x: 11 } : b));
    assert.equal(parseWorkshop(withScreen(offGrid), NOW).ok, false, 'passa da borda');
    const fakeBlock = defaultScreen().map((b) => (b.id === 'members' ? { ...b, block: 'login' } : b));
    assert.equal(parseWorkshop(withScreen(fakeBlock), NOW).ok, false, 'bloco que não existe');
    const dup = [...defaultScreen(), { ...defaultScreen()[3], y: 0, x: 10 }];
    assert.equal(parseWorkshop(withScreen(dup), NOW).ok, false, 'bloco repetido');
    const widgetAsBlock = [...noMembers, { ...placed('text'), id: 'main', x: 10 }];
    assert.equal(parseWorkshop(withScreen(widgetAsBlock), NOW).ok, false, 'widget não usa id de bloco');
  });

  it('tema do servidor: cores #rrggbb, listas fechadas e contraste mínimo', () => {
    const withTheme = (patch: Record<string, unknown>) => ({ ...emptyWorkshop(), theme: { ...defaultTheme(), ...patch } });
    assert.equal(parseWorkshop(withTheme({}), NOW).ok, true, 'o tema padrão passa');
    assert.equal(parseWorkshop(withTheme({ base: 'light', surface: '#f4f1ea', accent: '#b4235a', accent2: '#1d6b8a' }), NOW).ok, true, 'um claro bem feito passa');
    assert.equal(parseWorkshop(withTheme({ accent: 'red' }), NOW).ok, false, 'cor por nome');
    assert.equal(parseWorkshop(withTheme({ accent: '#FFF' }), NOW).ok, false, 'cor curta');
    assert.equal(parseWorkshop(withTheme({ accent: 'url(javascript:x)' }), NOW).ok, false);
    assert.match((parseWorkshop(withTheme({ base: 'light', surface: '#202020' }), NOW) as { error: string }).error, /contraste/, 'texto escuro em fundo escuro');
    assert.match((parseWorkshop(withTheme({ accent: '#1c2233' }), NOW) as { error: string }).error, /contraste/, 'destaque que some no fundo');
    assert.equal(parseWorkshop(withTheme({ font: 'Comic Sans' }), NOW).ok, false, 'fonte fora da lista');
    assert.equal(parseWorkshop(withTheme({ shape: 'circle' }), NOW).ok, false);
    assert.equal(parseWorkshop(withTheme({ css: 'body{}' }), NOW).ok, false, 'chave desconhecida');
    assert.equal(parseWorkshop(withTheme({ background: { url: 'https://evil.example/x.png', dim: 40 } }), NOW).ok, false, 'imagem de fora');
    assert.equal(parseWorkshop(withTheme({ background: { url: '', dim: 99 } }), NOW).ok, false, 'escurecer demais');
  });

  it('limita números (placar, pomodoro, data do evento)', () => {
    const sb = (score: number) => placed('scoreboard', { props: { title: 'P', rows: [{ name: 'A', score }], order: 'desc' } });
    assert.equal(parseWorkshop(withWidgets(sb(10)), NOW).ok, true);
    assert.equal(parseWorkshop(withWidgets(sb(1e9)), NOW).ok, false);
    const pomo = (focus: number) => placed('pomodoro', { props: { title: 'F', focus, pause: 5, startedAt: null } });
    assert.equal(parseWorkshop(withWidgets(pomo(25)), NOW).ok, true);
    assert.equal(parseWorkshop(withWidgets(pomo(500)), NOW).ok, false);
    const cd = (at: number) => placed('countdown', { props: { title: 'E', at, doneText: '' } });
    assert.equal(parseWorkshop(withWidgets(cd(NOW + 86400_000)), NOW).ok, true);
    assert.equal(parseWorkshop(withWidgets(cd(NOW + 10 * 365 * 86400_000)), NOW).ok, false);
  });
});

describe('rotas da Oficina', () => {
  let server: TestServer;
  before(async () => {
    server = await startServer({ WORKSHOP: 'true' });
  });
  after(() => server.stop());

  async function setup() {
    const owner = await signUp(server, 'dono');
    const serverId = (await owner.post('/servers', { name: 'Arena' })).body.id as string;
    const code = (await owner.post(`/servers/${serverId}/invites`, {})).body.code as string;
    const member = await signUp(server, 'membro');
    assert.equal((await member.post(`/invites/${code}`)).status, 200);
    return { owner, member, serverId };
  }

  it('rascunho fica só para quem gerencia; publicar mostra para os membros', async () => {
    const { owner, member, serverId } = await setup();
    const config: WorkshopConfig = { ...installPack(emptyWorkshop(), 'tatico'), mural: { title: 'Base', widgets: [placed('text') as never] } };

    const draft = await owner.req('PUT', `/servers/${serverId}/workshop/draft`, config);
    assert.equal(draft.status, 200);
    const seen = await member.get(`/servers/${serverId}/workshop`);
    assert.equal(seen.status, 200);
    assert.equal(seen.body.published, null, 'rascunho não aparece para membro');
    assert.equal(seen.body.draft, undefined, 'membro não vê o rascunho');
    assert.equal((await owner.get(`/servers/${serverId}/workshop`)).body.draft.mural.title, 'Base');

    assert.equal((await owner.post(`/servers/${serverId}/workshop/publish`, config)).status, 200);
    const after = await member.get(`/servers/${serverId}/workshop`);
    assert.equal(after.body.published.pieces.icon, 'tatico');
    const mine = await member.get('/workshop');
    assert.equal(mine.body[serverId].mural.title, 'Base');

    assert.equal((await owner.req('DELETE', `/servers/${serverId}/workshop/published`)).status, 200);
    assert.equal((await member.get(`/servers/${serverId}/workshop`)).body.published, null);
  });

  it('membro comum não salva, não publica nem tira do ar', async () => {
    const { member, serverId } = await setup();
    assert.equal((await member.req('PUT', `/servers/${serverId}/workshop/draft`, emptyWorkshop())).status, 403);
    assert.equal((await member.post(`/servers/${serverId}/workshop/publish`, emptyWorkshop())).status, 403);
    assert.equal((await member.req('DELETE', `/servers/${serverId}/workshop/published`)).status, 403);
  });

  it('quem não é do servidor não vê nada', async () => {
    const { serverId } = await setup();
    const stranger = await signUp(server, 'estranho');
    assert.equal((await stranger.get(`/servers/${serverId}/workshop`)).status, 404);
  });

  it('recusa configuração inválida e atalho para canal de outro servidor', async () => {
    const { owner, serverId } = await setup();
    const bad = await owner.req('PUT', `/servers/${serverId}/workshop/draft`, { ...emptyWorkshop(), customCss: 'x' });
    assert.equal(bad.status, 400);
    const other = (await owner.post('/servers', { name: 'Outro' })).body;
    const otherChannel = other.channels?.[0]?.id ?? (await owner.get(`/servers/${other.id}`)).body.channels[0].id;
    const res = await owner.req('PUT', `/servers/${serverId}/workshop/draft`, withWidgets(placed('channels', { props: { title: 'A', channelIds: [otherChannel] } })));
    assert.equal(res.status, 400);
    assert.match(res.body.error, /não é deste servidor/);
    // o mesmo vale para os widgets da tela
    const onScreen = { ...emptyWorkshop(), screen: { items: [...defaultScreen().filter((b) => b.id !== 'members'), placed('channels', { x: 10, w: 2, h: 2, props: { title: 'A', channelIds: [otherChannel] } })] } };
    assert.equal((await owner.req('PUT', `/servers/${serverId}/workshop/draft`, onScreen)).status, 400);
  });

  it('pomodoro: qualquer membro começa e para, no publicado', async () => {
    const { owner, member, serverId } = await setup();
    const config = withWidgets(placed('pomodoro', { id: 'pomo' }));
    assert.equal((await owner.post(`/servers/${serverId}/workshop/publish`, config)).status, 200);
    const start = await member.post(`/servers/${serverId}/workshop/pomodoro/pomo`, { start: true });
    assert.equal(start.status, 200);
    assert.equal(typeof start.body.published.mural.widgets[0].props.startedAt, 'number');
    const stop = await member.post(`/servers/${serverId}/workshop/pomodoro/pomo`, { start: false });
    assert.equal(stop.body.published.mural.widgets[0].props.startedAt, null);
    assert.equal((await member.post(`/servers/${serverId}/workshop/pomodoro/nada`, { start: true })).status, 404);
  });
});

describe('Oficina fora do Concord de testes', () => {
  let server: TestServer;
  before(async () => {
    server = await startServer();
  });
  after(() => server.stop());

  it('as rotas não existem', async () => {
    const owner = await signUp(server, 'dono');
    const serverId = (await owner.post('/servers', { name: 'Arena' })).body.id as string;
    assert.equal((await owner.get('/workshop')).status, 404);
    assert.equal((await owner.get(`/servers/${serverId}/workshop`)).status, 404);
    assert.equal((await owner.req('PUT', `/servers/${serverId}/workshop/draft`, emptyWorkshop())).status, 404);
  });
});
