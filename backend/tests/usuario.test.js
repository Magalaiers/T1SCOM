// Testes da gestão de usuários pelo ADMIN: listagem paginada, criação, perfil, senha e exclusão.
// Pré-requisitos: banco criado (database/schema.sql) e populado (npm run seed).
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../server');
const db = require('../src/config/db');
const { SENHA, criarManager, criarAdmin, removerUsuarios } = require('./helpers');

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const unico = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const dadosUsuario = (extra = {}) => {
  const id = unico();
  return { nome: `jestu_${id}`, email: `jestu.${id}@teste.com`, senha: SENHA, perfil: 'MANAGER', ...extra };
};

const listarPilotos = async (token) => (await request(app).get('/api/pilotos').set(token ? auth(token) : {})).body.dados;
const contarPilotosDoDono = async (id) => {
  const [r] = await db.execute('SELECT COUNT(*) AS total FROM pilotos WHERE dono_id = ?', [id]);
  return Number(r[0].total);
};

describe('Gestão de usuários (ADMIN)', () => {
  let admin;
  let outroAdmin;
  let manager;
  const criadosPelaApi = [];

  const criarPelaApi = async (extra) => {
    const r = await request(app).post('/api/usuarios').set(auth(admin.token)).send(dadosUsuario(extra));
    if (r.status === 201) criadosPelaApi.push(r.body.dados.id);
    return r;
  };

  beforeAll(async () => {
    admin = await criarAdmin(app);
    outroAdmin = await criarAdmin(app);
    manager = await criarManager(app);
  });

  afterAll(async () => {
    await removerUsuarios([admin.id, outroAdmin.id, manager.id, ...criadosPelaApi]);
    await db.end();
  });

  it('U1. SEGURANÇA: só o ADMIN acessa /api/usuarios (MANAGER 403, visitante 401) em todas as rotas', async () => {
    const rotas = [
      (t) => request(app).get('/api/usuarios').set(t),
      (t) => request(app).post('/api/usuarios').set(t).send(dadosUsuario()),
      (t) => request(app).put(`/api/usuarios/${admin.id}/perfil`).set(t).send({ perfil: 'MANAGER' }),
      (t) => request(app).put(`/api/usuarios/${admin.id}/senha`).set(t).send({ senha: 'Nova12345' }),
      (t) => request(app).delete(`/api/usuarios/${outroAdmin.id}`).set(t)
    ];
    for (const rota of rotas) {
      expect((await rota(auth(manager.token))).status).toBe(403);
      expect((await rota({})).status).toBe(401);
    }
    // nada disso mexeu em dados
    const [r] = await db.execute('SELECT perfil FROM usuarios WHERE id = ?', [admin.id]);
    expect(r[0].perfil).toBe('ADMIN');
  });

  it('U2. Listagem: paginada, sem expor hash de senha e com a contagem de pilotos de cada usuário', async () => {
    const r = await request(app).get('/api/usuarios?limite=5').set(auth(admin.token));
    expect(r.status).toBe(200);
    expect(r.body.dados.length).toBeLessThanOrEqual(5);
    expect(r.body.paginacao).toMatchObject({ pagina: 1, limite: 5 });
    expect(r.body.paginacao.total).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(r.body)).not.toMatch(/senha|\$2[aby]\$/i);

    const completa = await request(app).get(`/api/usuarios?busca=${encodeURIComponent(manager.email)}`).set(auth(admin.token));
    const item = completa.body.dados[0];
    expect(item).toMatchObject({ id: manager.id, perfil: 'MANAGER', equipe_criada: null, equipe_comandada: null });
    expect(item.total_pilotos).toBe((await listarPilotos()).length); // cópia completa do catálogo
  });

  it('U3. Busca e filtro por perfil; segunda página; parâmetros inválidos retornam 400', async () => {
    const porPerfil = await request(app).get('/api/usuarios?perfil=ADMIN&limite=50').set(auth(admin.token));
    expect(porPerfil.body.dados.every((u) => u.perfil === 'ADMIN')).toBe(true);

    const porNome = await request(app).get(`/api/usuarios?busca=${encodeURIComponent(admin.nome)}`).set(auth(admin.token));
    expect(porNome.body.dados.map((u) => u.id)).toContain(admin.id);

    const pagina1 = await request(app).get('/api/usuarios?limite=2&pagina=1').set(auth(admin.token));
    const pagina2 = await request(app).get('/api/usuarios?limite=2&pagina=2').set(auth(admin.token));
    expect(pagina2.body.paginacao.pagina).toBe(2);
    const ids1 = pagina1.body.dados.map((u) => u.id);
    expect(pagina2.body.dados.some((u) => ids1.includes(u.id))).toBe(false);

    for (const consulta of ['pagina=0', 'pagina=abc', 'limite=0', 'limite=51', 'perfil=ROOT']) {
      expect((await request(app).get(`/api/usuarios?${consulta}`).set(auth(admin.token))).status).toBe(400);
    }
  });

  it('U4. SEGURANÇA: SQL Injection e curingas do LIKE (% e _) na busca são tratados como texto literal', async () => {
    const injecao = await request(app).get(`/api/usuarios?busca=${encodeURIComponent("x' OR '1'='1")}`).set(auth(admin.token));
    expect(injecao.status).toBe(200);
    expect(injecao.body.dados).toHaveLength(0);

    // pares de nomes que só se distinguem se "_" e "%" forem tratados como texto, não como curinga
    const marca = unico();
    const [comUnderscore, semUnderscore, comPorcento, semPorcento] = await Promise.all([
      criarPelaApi({ nome: `uq${marca}x_y` }), criarPelaApi({ nome: `uq${marca}xzy` }),
      criarPelaApi({ nome: `uq${marca}100%` }), criarPelaApi({ nome: `uq${marca}100abc` })
    ]);
    expect([comUnderscore, semUnderscore, comPorcento, semPorcento].map((r) => r.status)).toEqual([201, 201, 201, 201]);

    const buscar = async (termo) => (await request(app).get(`/api/usuarios?busca=${encodeURIComponent(termo)}`).set(auth(admin.token))).body.dados.map((u) => u.nome);
    expect(await buscar(`uq${marca}x_y`)).toEqual([`uq${marca}x_y`]);   // "_" não casa com "z"
    expect(await buscar(`uq${marca}100%`)).toEqual([`uq${marca}100%`]); // "%" não casa com "abc"
    expect((await buscar(`uq${marca}`)).length).toBe(4);                // sem curinga: os 4 aparecem
    const soPorcento = await buscar('%');                               // "%" literal: só quem tem "%" no nome ou e-mail
    expect(soPorcento).toContain(`uq${marca}100%`);
    expect(soPorcento.every((nome) => nome.includes('%'))).toBe(true);
  });

  it('U5. Criar MANAGER (201) já entrega a cópia do catálogo e ele consegue entrar', async () => {
    const dados = dadosUsuario();
    const r = await request(app).post('/api/usuarios').set(auth(admin.token)).send(dados);
    expect(r.status).toBe(201);
    criadosPelaApi.push(r.body.dados.id);
    expect(r.body.dados).toMatchObject({ perfil: 'MANAGER' });
    expect(r.body.dados.total_pilotos).toBe((await listarPilotos()).length);

    const login = await request(app).post('/api/auth/login').send({ email: dados.email, senha: dados.senha });
    expect(login.status).toBe(200);
    expect(login.body.usuario.perfil).toBe('MANAGER');
  });

  it('U6. Criar ADMIN (201): não recebe cópia de pilotos', async () => {
    const r = await criarPelaApi({ perfil: 'ADMIN' });
    expect(r.status).toBe(201);
    expect(r.body.dados).toMatchObject({ perfil: 'ADMIN', total_pilotos: 0 });
  });

  it('U7. Validação e duplicidade na criação: senha fraca, perfil inválido, e-mail e nome repetidos', async () => {
    const fraca = await request(app).post('/api/usuarios').set(auth(admin.token)).send(dadosUsuario({ senha: 'curta' }));
    expect(fraca.status).toBe(400);
    expect(fraca.body.erros.map((e) => e.campo)).toContain('senha');

    const perfilRuim = await request(app).post('/api/usuarios').set(auth(admin.token)).send(dadosUsuario({ perfil: 'ROOT' }));
    expect(perfilRuim.status).toBe(400);
    expect(perfilRuim.body.erros.map((e) => e.campo)).toContain('perfil');

    const semPerfil = await request(app).post('/api/usuarios').set(auth(admin.token)).send({ ...dadosUsuario(), perfil: undefined });
    expect(semPerfil.status).toBe(400);

    expect((await request(app).post('/api/usuarios').set(auth(admin.token)).send(dadosUsuario({ email: manager.email }))).status).toBe(409);
    expect((await request(app).post('/api/usuarios').set(auth(admin.token)).send(dadosUsuario({ nome: manager.nome }))).status).toBe(409);
  });

  it('U8. SEGURANÇA: o ADMIN não altera o próprio perfil nem exclui a própria conta (409)', async () => {
    expect((await request(app).put(`/api/usuarios/${admin.id}/perfil`).set(auth(admin.token)).send({ perfil: 'MANAGER' })).status).toBe(409);
    expect((await request(app).delete(`/api/usuarios/${admin.id}`).set(auth(admin.token))).status).toBe(409);

    const [r] = await db.execute('SELECT perfil FROM usuarios WHERE id = ?', [admin.id]);
    expect(r[0].perfil).toBe('ADMIN'); // continua existindo e continua ADMIN: sempre sobra um ADMIN
  });

  it('U9. MANAGER -> ADMIN: apaga os dados pessoais e o token passa a ter poderes de ADMIN na hora', async () => {
    const alvo = await criarManager(app);
    criadosPelaApi.push(alvo.id);
    expect((await request(app).post('/api/equipes/minha').set(auth(alvo.token)).send({ nome: `Equipe ${unico()}`, pais: 'Brasil', campeonato_id: 1 })).status).toBe(201);
    expect(await contarPilotosDoDono(alvo.id)).toBeGreaterThan(0);

    const r = await request(app).put(`/api/usuarios/${alvo.id}/perfil`).set(auth(admin.token)).send({ perfil: 'ADMIN' });
    expect(r.status).toBe(200);
    expect(r.body.dados).toMatchObject({ perfil: 'ADMIN', total_pilotos: 0, equipe_criada: null });

    const [equipes] = await db.execute('SELECT COUNT(*) AS total FROM equipes WHERE dono_id = ?', [alvo.id]);
    const [ligacoes] = await db.execute('SELECT COUNT(*) AS total FROM equipe_comandada WHERE usuario_id = ?', [alvo.id]);
    expect([await contarPilotosDoDono(alvo.id), Number(equipes[0].total), Number(ligacoes[0].total)]).toEqual([0, 0, 0]);

    // o MESMO token (emitido quando ele era MANAGER) agora vale como ADMIN: o perfil vem do banco
    expect((await request(app).get('/api/usuarios').set(auth(alvo.token))).status).toBe(200);
    expect((await request(app).get('/api/equipes/minha').set(auth(alvo.token))).status).toBe(403);
    expect((await listarPilotos(alvo.token)).length).toBe((await listarPilotos()).length); // vê o catálogo
  });

  it('U10. ADMIN -> MANAGER: recebe uma cópia nova do catálogo e perde o acesso à gestão', async () => {
    const criado = await criarPelaApi({ perfil: 'ADMIN' });
    const id = criado.body.dados.id;
    const login = await request(app).post('/api/auth/login').send({ email: criado.body.dados.email, senha: SENHA });

    const r = await request(app).put(`/api/usuarios/${id}/perfil`).set(auth(admin.token)).send({ perfil: 'MANAGER' });
    expect(r.status).toBe(200);
    expect(r.body.dados.total_pilotos).toBe((await listarPilotos()).length);
    expect((await request(app).get('/api/usuarios').set(auth(login.body.token))).status).toBe(403);
  });

  it('U11. Alterar para o perfil que ele já tem não muda nada; id inexistente retorna 404; id inválido, 400', async () => {
    const antes = await contarPilotosDoDono(manager.id);
    const igual = await request(app).put(`/api/usuarios/${manager.id}/perfil`).set(auth(admin.token)).send({ perfil: 'MANAGER' });
    expect(igual.status).toBe(200);
    expect(await contarPilotosDoDono(manager.id)).toBe(antes);

    expect((await request(app).put('/api/usuarios/9999999/perfil').set(auth(admin.token)).send({ perfil: 'ADMIN' })).status).toBe(404);
    expect((await request(app).put('/api/usuarios/abc/perfil').set(auth(admin.token)).send({ perfil: 'ADMIN' })).status).toBe(400);
    expect((await request(app).put(`/api/usuarios/${manager.id}/perfil`).set(auth(admin.token)).send({ perfil: 'ROOT' })).status).toBe(400);
  });

  it('U12. Redefinir senha: a antiga deixa de funcionar, a nova funciona, a hash é bcrypt e nada vaza na resposta', async () => {
    const alvo = await criarPelaApi({});
    const id = alvo.body.dados.id;
    const email = alvo.body.dados.email;

    const r = await request(app).put(`/api/usuarios/${id}/senha`).set(auth(admin.token)).send({ senha: 'NovaSenha789' });
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body)).not.toMatch(/NovaSenha789|\$2[aby]\$/);

    expect((await request(app).post('/api/auth/login').send({ email, senha: SENHA })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email, senha: 'NovaSenha789' })).status).toBe(200);

    const [linhas] = await db.execute('SELECT senha_hash FROM usuarios WHERE id = ?', [id]);
    expect(await bcrypt.compare('NovaSenha789', linhas[0].senha_hash)).toBe(true);

    expect((await request(app).put(`/api/usuarios/${id}/senha`).set(auth(admin.token)).send({ senha: 'fraca' })).status).toBe(400);
    expect((await request(app).put('/api/usuarios/9999999/senha').set(auth(admin.token)).send({ senha: 'NovaSenha789' })).status).toBe(404);
  });

  it('U13. Excluir usuário: informa o que saiu junto (pilotos e equipe), apaga em cascata e o token dele deixa de valer', async () => {
    const alvo = await criarManager(app);
    const equipeNome = `Equipe ${unico()}`;
    await request(app).post('/api/equipes/minha').set(auth(alvo.token)).send({ nome: equipeNome, pais: 'Brasil', campeonato_id: 1 });
    const totalPilotos = await contarPilotosDoDono(alvo.id);

    const r = await request(app).delete(`/api/usuarios/${alvo.id}`).set(auth(admin.token));
    expect(r.status).toBe(200);
    expect(r.body.dados).toEqual({ pilotos_removidos: totalPilotos, equipe_removida: equipeNome });

    expect(await contarPilotosDoDono(alvo.id)).toBe(0);
    const [equipes] = await db.execute('SELECT COUNT(*) AS total FROM equipes WHERE dono_id = ?', [alvo.id]);
    expect(Number(equipes[0].total)).toBe(0);
    expect((await request(app).get('/api/pilotos').set(auth(alvo.token))).status).toBe(401); // sessão inválida

    expect((await request(app).delete(`/api/usuarios/${alvo.id}`).set(auth(admin.token))).status).toBe(404);
    expect((await request(app).delete('/api/usuarios/abc').set(auth(admin.token))).status).toBe(400);
  });

  it('U14. Um ADMIN pode excluir outro ADMIN (nunca a si mesmo) e o catálogo não é afetado', async () => {
    const catalogoAntes = (await listarPilotos()).length;
    const r = await criarPelaApi({ perfil: 'ADMIN' });
    const del = await request(app).delete(`/api/usuarios/${r.body.dados.id}`).set(auth(outroAdmin.token));
    expect(del.status).toBe(200);
    expect((await listarPilotos()).length).toBe(catalogoAntes);
  });
});