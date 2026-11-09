// Logout com revogação real do token: depois do logout o MESMO token deixa de valer (401),
// mesmo antes de expirar. Pré-requisito: banco criado pelo database/schema.sql e populado (npm run seed).
const crypto = require('crypto');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const db = require('../src/config/db');
const { JWT_SECRET } = require('../src/config/jwt');
const { SENHA, criarManager, criarAdmin, removerUsuarios } = require('./helpers');

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const login = (u) => request(app).post('/api/auth/login').send({ email: u.email, senha: SENHA });
const jtiDe = (token) => jwt.decode(token).jti;
const linhasRevogadas = async (jti) => {
  const [r] = await db.execute('SELECT jti, usuario_id, expira_em FROM tokens_revogados WHERE jti = ?', [jti]);
  return r;
};

describe('Logout com revogação do token', () => {
  const ids = [];
  afterAll(async () => {
    await removerUsuarios(ids);
    await db.end();
  });

  it('L1. SEGURANÇA: depois do logout o mesmo token é recusado (401) em rotas protegidas e opcionais', async () => {
    const u = await criarManager(app);
    ids.push(u.id);

    expect((await request(app).get('/api/auth/perfil').set(auth(u.token))).status).toBe(200);
    expect((await request(app).post('/api/auth/logout').set(auth(u.token))).status).toBe(200);

    const reaproveitado = await request(app).get('/api/auth/perfil').set(auth(u.token));
    expect(reaproveitado.status).toBe(401);
    expect(reaproveitado.body.mensagem).toMatch(/Sessão encerrada/);
    expect((await request(app).get('/api/equipes/minha').set(auth(u.token))).status).toBe(401);
    // rota de autenticação opcional: o token revogado NÃO vira "visitante", é recusado
    expect((await request(app).get('/api/pilotos').set(auth(u.token))).status).toBe(401);
    // e o visitante de verdade continua entrando normalmente
    expect((await request(app).get('/api/pilotos')).status).toBe(200);
  });

  it('L2. O logout revoga só o token usado: um novo login do mesmo usuário continua válido', async () => {
    const u = await criarManager(app);
    ids.push(u.id);
    const segundo = (await login(u)).body.token;
    expect(jtiDe(segundo)).not.toBe(jtiDe(u.token)); // cada login gera um token com identificador próprio

    await request(app).post('/api/auth/logout').set(auth(u.token));
    expect((await request(app).get('/api/auth/perfil').set(auth(u.token))).status).toBe(401);
    expect((await request(app).get('/api/auth/perfil').set(auth(segundo))).status).toBe(200);
  });

  it('L3. Logout repetido com o mesmo token retorna 401 e não gera registro duplicado', async () => {
    const u = await criarManager(app);
    ids.push(u.id);
    await request(app).post('/api/auth/logout').set(auth(u.token));
    expect((await request(app).post('/api/auth/logout').set(auth(u.token))).status).toBe(401);
    expect(await linhasRevogadas(jtiDe(u.token))).toHaveLength(1);
  });

  it('L4. SEGURANÇA: token assinado com o segredo certo, mas sem identificador (jti), é recusado', async () => {
    const u = await criarManager(app);
    ids.push(u.id);
    const semJti = jwt.sign({ id: u.id, nome: u.nome, email: u.email, perfil: 'MANAGER' }, JWT_SECRET, { expiresIn: '1h' });
    expect((await request(app).get('/api/auth/perfil').set(auth(semJti))).status).toBe(401);
  });

  it('L5. A revogação guarda o jti e a expiração; registros de tokens já expirados são limpos no próximo logout', async () => {
    const u = await criarManager(app);
    ids.push(u.id);
    const antigo = crypto.randomUUID();
    await db.execute('INSERT INTO tokens_revogados (jti, usuario_id, expira_em) VALUES (?, ?, UNIX_TIMESTAMP() - 7200)', [antigo, u.id]);
    expect(await linhasRevogadas(antigo)).toHaveLength(1);

    await request(app).post('/api/auth/logout').set(auth(u.token));

    const [registro] = await linhasRevogadas(jtiDe(u.token));
    expect(registro).toMatchObject({ usuario_id: u.id, expira_em: jwt.decode(u.token).exp });
    expect(await linhasRevogadas(antigo)).toHaveLength(0); // expirado há 2 h: removido
  });

  it('L6. SEGURANÇA: o token revogado de um ADMIN perde o acesso à gestão de usuários', async () => {
    const admin = await criarAdmin(app);
    ids.push(admin.id);
    expect((await request(app).get('/api/usuarios').set(auth(admin.token))).status).toBe(200);
    await request(app).post('/api/auth/logout').set(auth(admin.token));
    expect((await request(app).get('/api/usuarios').set(auth(admin.token))).status).toBe(401);
  });

  it('L7. Ao excluir o usuário, os registros de tokens revogados dele saem junto (CASCADE)', async () => {
    const u = await criarManager(app);
    await request(app).post('/api/auth/logout').set(auth(u.token));
    expect(await linhasRevogadas(jtiDe(u.token))).toHaveLength(1);
    await removerUsuarios([u.id]);
    expect(await linhasRevogadas(jtiDe(u.token))).toHaveLength(0);
  });
});