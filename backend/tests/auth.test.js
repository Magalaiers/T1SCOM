// Testes de autenticação: cadastro, login, token e perfis.
// Pré-requisitos: banco criado (database/schema.sql). Cada teste cria os próprios usuários e os remove ao final.
const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../server');
const db = require('../src/config/db');
const { validarRegistro, validarLogin } = require('../src/utils/validators');

const JWT_SECRET = process.env.JWT_SECRET;
const SENHA = 'Senha1234';
const sufixo = Date.now().toString(36);
const novoUsuario = (extra = {}) => ({
  nome: `jest_${sufixo}_${Math.random().toString(36).slice(2, 7)}`,
  email: `jest.${sufixo}.${Math.random().toString(36).slice(2, 7)}@teste.com`,
  senha: SENHA,
  ...extra
});

// ---------------------------------------------------------------------
// Validação (sem banco)
// ---------------------------------------------------------------------
describe('Validação de cadastro e login', () => {
  it('A1. Aceita cadastro válido e normaliza e-mail (minúsculas) e nome (sanitizado)', () => {
    const r = validarRegistro({ nome: '  Ana  <b>Silva</b> ', email: ' ANA@Teste.COM ', senha: SENHA });
    expect(r.valido).toBe(true);
    expect(r.dados.email).toBe('ana@teste.com');
    expect(r.dados.nome).toBe('Ana bSilva/b');
  });

  it('A2. Rejeita e-mail inválido, senha curta, senha sem número e nome com "@"', () => {
    expect(validarRegistro({ nome: 'abc', email: 'sem-arroba', senha: SENHA }).erros[0].campo).toBe('email');
    expect(validarRegistro({ nome: 'abc', email: 'a@b.co', senha: 'curta1' }).erros[0].campo).toBe('senha');
    expect(validarRegistro({ nome: 'abc', email: 'a@b.co', senha: 'somenteletras' }).erros[0].campo).toBe('senha');
    expect(validarRegistro({ nome: 'ana@x.com', email: 'a@b.co', senha: SENHA }).erros[0].campo).toBe('nome');
  });

  it('A3. Rejeita tipos inesperados (objeto no lugar de texto) no cadastro e no login', () => {
    expect(validarRegistro({ nome: 'abc', email: { $ne: null }, senha: SENHA }).valido).toBe(false);
    expect(validarLogin({ email: { $ne: null }, senha: { $ne: null } }).erros).toHaveLength(2);
    expect(validarLogin(null).valido).toBe(false);
  });
});

// ---------------------------------------------------------------------
// API (integração)
// ---------------------------------------------------------------------
describe('API de autenticação', () => {
  const criadosEmails = [];

  const registrar = async (usuario) => {
    const r = await request(app).post('/api/auth/registrar').send(usuario);
    if (r.status === 201) criadosEmails.push(usuario.email.toLowerCase());
    return r;
  };
  const login = (identificador, senha) => request(app).post('/api/auth/login').send({ email: identificador, senha });

  afterAll(async () => {
    if (criadosEmails.length) await db.query('DELETE FROM usuarios WHERE email IN (?)', [criadosEmails]);
    await db.end();
  });

  it('B1. Cadastra (201) e permite login por e-mail e por nome de usuário', async () => {
    const u = novoUsuario();
    expect((await registrar(u)).status).toBe(201);

    const porEmail = await login(u.email, u.senha);
    expect(porEmail.status).toBe(200);
    expect(porEmail.body.token).toEqual(expect.any(String));
    expect(porEmail.body.usuario.perfil).toBe('MANAGER');

    const porNome = await login(u.nome, u.senha);
    expect(porNome.status).toBe(200);
    expect(porNome.body.usuario.email).toBe(u.email.toLowerCase());
  });

  it('B2. Cadastro com e-mail ou nome repetido retorna 409', async () => {
    const u = novoUsuario();
    await registrar(u);
    const emailRepetido = await registrar({ ...novoUsuario(), email: u.email });
    expect(emailRepetido.status).toBe(409);
    const nomeRepetido = await registrar({ ...novoUsuario(), nome: u.nome });
    expect(nomeRepetido.status).toBe(409);
  });

  it('B3. Cadastro inválido retorna 400 com erros por campo', async () => {
    const r = await registrar(novoUsuario({ senha: '123' }));
    expect(r.status).toBe(400);
    expect(r.body.status).toBe('erro');
    expect(r.body.erros[0].campo).toBe('senha');
  });

  it('B4. SEGURANÇA: o cliente não consegue se cadastrar como ADMIN (campo "perfil" é ignorado)', async () => {
    const u = novoUsuario({ perfil: 'ADMIN' });
    await registrar(u);
    const r = await login(u.email, u.senha);
    expect(r.body.usuario.perfil).toBe('MANAGER');
  });

  it('B5. Credenciais erradas ou usuário inexistente retornam a mesma resposta 401', async () => {
    const u = novoUsuario();
    await registrar(u);
    const senhaErrada = await login(u.email, 'OutraSenha99');
    const naoExiste = await login('ninguem@teste.com', SENHA);
    expect(senhaErrada.status).toBe(401);
    expect(naoExiste.status).toBe(401);
    expect(senhaErrada.body.mensagem).toBe(naoExiste.body.mensagem);
  });

  it('B6. SEGURANÇA: tentativas de SQL Injection no login falham (401) sem erro de banco', async () => {
    const a = await login("' OR '1'='1", "' OR '1'='1");
    const b = await login("admin@x.com' --", 'qualquer');
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
  });

  it('B7. SEGURANÇA: payload de objeto no login ({"$ne":null}) é recusado com 400', async () => {
    const r = await request(app).post('/api/auth/login').send({ email: { $ne: null }, senha: { $ne: null } });
    expect(r.status).toBe(400);
  });

  it('B8. SEGURANÇA: senha em texto puro gravada no banco NÃO autentica (só hash bcrypt)', async () => {
    const u = novoUsuario();
    await db.execute('INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES (?, ?, ?, ?)', [u.nome, u.email, 'texto-puro-123', 'ADMIN']);
    criadosEmails.push(u.email);
    const r = await login(u.email, 'texto-puro-123');
    expect(r.status).toBe(401);
  });

  it('B9. Senha é armazenada como hash bcrypt, nunca em texto', async () => {
    const u = novoUsuario();
    await registrar(u);
    const [linhas] = await db.execute('SELECT senha_hash FROM usuarios WHERE email = ?', [u.email]);
    expect(linhas[0].senha_hash).not.toBe(u.senha);
    expect(linhas[0].senha_hash).toMatch(/^\$2[aby]\$/);
    expect(await bcrypt.compare(u.senha, linhas[0].senha_hash)).toBe(true);
  });

  it('B10. Rotas autenticadas: sem token 401; com token válido 200 e dados do usuário', async () => {
    const u = novoUsuario();
    await registrar(u);
    const { token } = (await login(u.email, u.senha)).body;

    expect((await request(app).get('/api/auth/perfil')).status).toBe(401);
    const perfil = await request(app).get('/api/auth/perfil').set('Authorization', `Bearer ${token}`);
    expect(perfil.status).toBe(200);
    expect(perfil.body.dados.email).toBe(u.email.toLowerCase());
    expect(perfil.body.dados).not.toHaveProperty('senha_hash');
  });

  it('B11. SEGURANÇA: token expirado, com outro segredo ou sem assinatura (alg none) é recusado (401)', async () => {
    const payload = { id: 1, nome: 'x', email: 'x@x.com', perfil: 'ADMIN' };
    const expirado = jwt.sign(payload, JWT_SECRET, { expiresIn: -10 });
    const outroSegredo = jwt.sign(payload, 'segredo-diferente-do-servidor');
    const semAssinatura = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.`;

    for (const token of [expirado, outroSegredo, semAssinatura]) {
      const r = await request(app).get('/api/auth/perfil').set('Authorization', `Bearer ${token}`);
      expect(r.status).toBe(401);
    }
  });

  it('B12. Logout exige token (401 sem) e responde 200 com token válido', async () => {
    const u = novoUsuario();
    await registrar(u);
    const { token } = (await login(u.email, u.senha)).body;
    expect((await request(app).post('/api/auth/logout')).status).toBe(401);
    expect((await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`)).status).toBe(200);
  });
});