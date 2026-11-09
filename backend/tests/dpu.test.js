// Dados por usuário
// Testes do isolamento de dados: cada MANAGER tem a sua cópia dos pilotos; o ADMIN cuida do catálogo-modelo.
// Pré-requisitos: banco criado (database/schema.sql) e populado (npm run seed).
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const db = require('../src/config/db');
const { ATRIBUTOS } = require('../src/utils/validators');
const { criarManager, criarAdmin, removerUsuarios } = require('./helpers');

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const atributos = Object.fromEntries(ATRIBUTOS.map((c) => [c, 14]));
const pilotoValido = (extra = {}) => ({ nome: 'Piloto Isolamento', pais: 'Brasil', idade: 23, salario_anual: 900000, atributos, ...extra });
const nomeUnico = (prefixo) => `${prefixo} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const listar = async (token) => {
  const r = await request(app).get('/api/pilotos').set(token ? auth(token) : {});
  return r.body.dados;
};
const criarPiloto = (token, extra) => request(app).post('/api/pilotos').set(auth(token)).send(pilotoValido(extra));

describe('Isolamento de dados por usuário', () => {
  let admin;
  let ana;
  let bruno;
  const usuariosExtras = [];
  const pilotosDoCatalogo = []; // criados pelo ADMIN neste arquivo (precisam ser apagados no final)

  beforeAll(async () => {
    admin = await criarAdmin(app);
    ana = await criarManager(app);
    bruno = await criarManager(app);
  });

  afterAll(async () => {
    if (pilotosDoCatalogo.length) await db.query('DELETE FROM pilotos WHERE id IN (?)', [pilotosDoCatalogo]);
    await removerUsuarios([admin.id, ana.id, bruno.id, ...usuariosExtras]);
    await db.end();
  });

  it('I1. Novo MANAGER recebe uma cópia completa do catálogo-modelo, com registros próprios (IDs diferentes)', async () => {
    const catalogo = await listar();
    const copiaDaAna = await listar(ana.token);

    expect(catalogo.length).toBeGreaterThan(0);
    expect(copiaDaAna.map((p) => p.nome)).toEqual(catalogo.map((p) => p.nome));

    const idsDoCatalogo = new Set(catalogo.map((p) => p.id));
    expect(copiaDaAna.some((p) => idsDoCatalogo.has(p.id))).toBe(false);
  });

  it('I2. Piloto criado por um MANAGER só aparece para ele (nem outro MANAGER, nem visitante, nem ADMIN)', async () => {
    const nome = nomeUnico('Piloto da Ana');
    const criado = await criarPiloto(ana.token, { nome });
    expect(criado.status).toBe(201);

    expect((await listar(ana.token)).some((p) => p.nome === nome)).toBe(true);
    expect((await listar(bruno.token)).some((p) => p.nome === nome)).toBe(false);
    expect((await listar()).some((p) => p.nome === nome)).toBe(false);
    expect((await listar(admin.token)).some((p) => p.nome === nome)).toBe(false);
  });

  it('I3. SEGURANÇA (IDOR): um MANAGER não lê, edita nem exclui o piloto de outro (404) e nada muda', async () => {
    const alvo = (await criarPiloto(ana.token, { nome: nomeUnico('Alvo da Ana'), salario_anual: 111000 })).body.dados;

    const ler = await request(app).get(`/api/pilotos/${alvo.id}`).set(auth(bruno.token));
    const editar = await request(app).put(`/api/pilotos/${alvo.id}`).set(auth(bruno.token)).send({ salario_anual: 1 });
    const excluir = await request(app).delete(`/api/pilotos/${alvo.id}`).set(auth(bruno.token));
    expect([ler.status, editar.status, excluir.status]).toEqual([404, 404, 404]);

    const intacto = await request(app).get(`/api/pilotos/${alvo.id}`).set(auth(ana.token));
    expect(intacto.status).toBe(200);
    expect(intacto.body.dados.salario_anual).toBe(111000);
  });

  it('I4. SEGURANÇA: o MANAGER não consegue alterar nem apagar o catálogo-modelo (404) e o visitante continua lendo', async () => {
    const catalogo = await listar();
    const idDoCatalogo = catalogo[0].id;

    const ler = await request(app).get(`/api/pilotos/${idDoCatalogo}`).set(auth(ana.token));
    const editar = await request(app).put(`/api/pilotos/${idDoCatalogo}`).set(auth(ana.token)).send({ salario_anual: 1 });
    const excluir = await request(app).delete(`/api/pilotos/${idDoCatalogo}`).set(auth(ana.token));
    expect([ler.status, editar.status, excluir.status]).toEqual([404, 404, 404]);

    expect((await request(app).get(`/api/pilotos/${idDoCatalogo}`)).status).toBe(200);
    expect((await listar()).length).toBe(catalogo.length);
  });

  it('I5. MANAGER edita e exclui livremente a própria cópia, sem afetar o catálogo nem outros usuários', async () => {
    const catalogoAntes = (await listar()).length;
    const brunoAntes = (await listar(bruno.token)).length;
    const minha = (await listar(ana.token))[0];

    const editou = await request(app).put(`/api/pilotos/${minha.id}`).set(auth(ana.token)).send({ salario_anual: 7777000 });
    expect(editou.status).toBe(200);
    expect(editou.body.dados.salario_anual).toBe(7777000);

    const cheiaAntes = (await listar(ana.token)).length;
    const excluiu = await request(app).delete(`/api/pilotos/${minha.id}`).set(auth(ana.token));
    expect(excluiu.status).toBe(200);

    expect((await listar(ana.token)).length).toBe(cheiaAntes - 1);
    expect((await listar()).length).toBe(catalogoAntes);
    expect((await listar(bruno.token)).length).toBe(brunoAntes);
  });

  it('I6. ADMIN altera o catálogo: cópias já existentes não mudam, mas novos usuários recebem a versão atual', async () => {
    const nome = nomeUnico('Piloto do Catalogo');
    const criado = await criarPiloto(admin.token, { nome });
    expect(criado.status).toBe(201);
    pilotosDoCatalogo.push(criado.body.dados.id);

    expect((await listar()).some((p) => p.nome === nome)).toBe(true);
    expect((await listar(ana.token)).some((p) => p.nome === nome)).toBe(false);

    const carla = await criarManager(app);
    usuariosExtras.push(carla.id);
    expect((await listar(carla.token)).some((p) => p.nome === nome)).toBe(true);
  });

  it('I7. "Restaurar meus dados" devolve a cópia ao catálogo-modelo e não afeta outros usuários', async () => {
    const catalogo = await listar();
    const anaAntes = (await listar(ana.token)).length;

    const meus = await listar(bruno.token);
    const editado = meus[0];
    await request(app).put(`/api/pilotos/${editado.id}`).set(auth(bruno.token)).send({ salario_anual: 1234567 });
    const extra = nomeUnico('Piloto Extra do Bruno');
    await criarPiloto(bruno.token, { nome: extra });
    await request(app).delete(`/api/pilotos/${meus[1].id}`).set(auth(bruno.token));

    const r = await request(app).post('/api/pilotos/restaurar').set(auth(bruno.token));
    expect(r.status).toBe(200);
    expect(r.body.dados.total).toBe(catalogo.length);

    const depois = await listar(bruno.token);
    expect(depois.length).toBe(catalogo.length);
    expect(depois.some((p) => p.nome === extra)).toBe(false);
    expect(depois.find((p) => p.nome === editado.nome).salario_anual).not.toBe(1234567);
    expect((await listar(ana.token)).length).toBe(anaAntes);
  });

  it('I8. Rota de leitura pública: sem token = visitante (200); token inválido = 401', async () => {
    expect((await request(app).get('/api/pilotos')).status).toBe(200);
    const invalido = await request(app).get('/api/pilotos').set(auth('token.invalido.qualquer'));
    expect(invalido.status).toBe(401);
  });

  it('I9. SEGURANÇA: token que afirma ser ADMIN não dá acesso ao catálogo (vale o perfil real do banco)', async () => {
    const nome = nomeUnico('Tentativa de Escalada');
    const forjado = jwt.sign({ id: ana.id, nome: ana.nome, email: ana.email, perfil: 'ADMIN' }, process.env.JWT_SECRET, { expiresIn: '1h', jwtid: 'forjado-i9' });

    const criado = await request(app).post('/api/pilotos').set(auth(forjado)).send(pilotoValido({ nome }));
    expect(criado.status).toBe(201);
    expect((await listar()).some((p) => p.nome === nome)).toBe(false); // não foi para o catálogo
    expect((await listar(ana.token)).some((p) => p.nome === nome)).toBe(true); // ficou na cópia da Ana
  });

  it('I10. SEGURANÇA: ao excluir o usuário, o token dele deixa de valer (401) e a cópia de pilotos é apagada', async () => {
    const dani = await criarManager(app);
    const [antes] = await db.execute('SELECT COUNT(*) AS total FROM pilotos WHERE dono_id = ?', [dani.id]);
    expect(Number(antes[0].total)).toBeGreaterThan(0);

    await db.execute('DELETE FROM usuarios WHERE id = ?', [dani.id]);

    const comTokenAntigo = await request(app).get('/api/pilotos').set(auth(dani.token));
    expect(comTokenAntigo.status).toBe(401);
    const [depois] = await db.execute('SELECT COUNT(*) AS total FROM pilotos WHERE dono_id = ?', [dani.id]);
    expect(Number(depois[0].total)).toBe(0);
  });
});