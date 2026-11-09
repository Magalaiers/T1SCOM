// Testes automatizados: lógica de negócio (unitários) + API (integração).
// Pré-requisitos: banco criado (database/schema.sql) e populado (npm run seed).
const request = require('supertest');
const app = require('../server');
const db = require('../src/config/db');
const {
  ATRIBUTOS, validarPiloto, mesclarPiloto, resolverEstrelas, calcularEstrelasAtuais, validarId
} = require('../src/utils/validators');
const { criarManager, criarAdmin, removerUsuarios } = require('./helpers');

const atributosValidos = (valor = 15) => Object.fromEntries(ATRIBUTOS.map((c) => [c, valor]));
const pilotoValido = (extra = {}) => ({
  nome: 'Piloto Teste Jest',
  pais: 'Brasil',
  idade: 22,
  salario_anual: 1200000,
  equipe_id: null,
  atributos: atributosValidos(15),
  ...extra
});

// ---------------------------------------------------------------------
// Lógica de negócio (sem banco)
// ---------------------------------------------------------------------
describe('Validação e regras de negócio', () => {
  it('U1. Aceita um piloto válido e normaliza o status para "Disponivel" sem equipe', () => {
    const r = validarPiloto(pilotoValido());
    expect(r.valido).toBe(true);
    expect(r.dados.status_contrato).toBe('Disponivel');
  });

  it('U2. Rejeita idade fora do intervalo, atributo acima de 20 e nome curto, com erros estruturados por campo', () => {
    const r = validarPiloto(pilotoValido({ nome: 'A', idade: 12, atributos: { ...atributosValidos(), frenagem: 25 } }));
    expect(r.valido).toBe(false);
    const campos = r.erros.map((e) => e.campo);
    expect(campos).toEqual(expect.arrayContaining(['nome', 'idade', 'atributos.frenagem']));
  });

  it('U3. Rejeita tipos errados (idade em texto, salário negativo)', () => {
    const r = validarPiloto(pilotoValido({ idade: '22', salario_anual: -5 }));
    expect(r.erros.map((e) => e.campo)).toEqual(expect.arrayContaining(['idade', 'salario_anual']));
  });

  it('U4. Sanitiza o nome removendo < > e normalizando espaços', () => {
    const r = validarPiloto(pilotoValido({ nome: '  <script>alert(1)</script>   Ana   ' }));
    expect(r.valido).toBe(true);
    expect(r.dados.nome).toBe('scriptalert(1)/script Ana');
    expect(r.dados.nome).not.toMatch(/[<>]/);
  });

  it('U5. Calcula as estrelas atuais pela média dos 9 atributos (escala 0-20 -> 0.5-5.0)', () => {
    expect(calcularEstrelasAtuais(atributosValidos(20))).toBe(5);
    expect(calcularEstrelasAtuais(atributosValidos(10))).toBe(2.5);
    expect(calcularEstrelasAtuais(atributosValidos(0))).toBe(0.5);
  });

  it('U6. Só recalcula as estrelas quando algum atributo muda; potencial nunca fica abaixo das atuais', () => {
    const existente = { atributos: atributosValidos(15), estrelas_atuais: 3.9, estrelas_potencial: 4.2 };
    // nenhum atributo alterado -> preserva as estrelas gravadas
    expect(resolverEstrelas({ atributos: atributosValidos(15) }, existente)).toEqual({ estrelas_atuais: 3.9, estrelas_potencial: 4.2 });
    // atributos sobem para 20 -> atuais = 5.0 e potencial acompanha
    expect(resolverEstrelas({ atributos: atributosValidos(20) }, existente)).toEqual({ estrelas_atuais: 5, estrelas_potencial: 5 });
  });

  it('U7. Mescla edição parcial: campos omitidos mantêm o valor atual, atributos são mesclados um a um', () => {
    const existente = { ...pilotoValido(), pay_driver: false, marketability: 50 };
    const mesclado = mesclarPiloto(existente, { salario_anual: 999, atributos: { foco: 3 } });
    expect(mesclado.nome).toBe(existente.nome);
    expect(mesclado.salario_anual).toBe(999);
    expect(mesclado.atributos.foco).toBe(3);
    expect(mesclado.atributos.frenagem).toBe(15);
  });

  it('U8. Valida identificadores (rejeita texto, zero e tentativas de injeção)', () => {
    expect(validarId('12')).toBe(12);
    expect(validarId('0')).toBeNull();
    expect(validarId('abc')).toBeNull();
    expect(validarId('1 OR 1=1')).toBeNull();
  });
});

// ---------------------------------------------------------------------
// API (integração com o banco)
// ---------------------------------------------------------------------
describe('API de pilotos', () => {
  const criados = [];
  let admin;
  let tokenAdmin;
  let equipeId;

  const auth = (token) => ({ Authorization: `Bearer ${token}` });
  const criar = async (extra = {}) => {
    const r = await request(app).post('/api/pilotos').set(auth(tokenAdmin)).send(pilotoValido(extra));
    if (r.body.dados && r.body.dados.id) criados.push(r.body.dados.id);
    return r;
  };

  beforeAll(async () => {
    // O ADMIN edita o catálogo-modelo (os pilotos criados aqui são do catálogo)
    admin = await criarAdmin(app);
    tokenAdmin = admin.token;
    const equipes = await request(app).get('/api/equipes');
    equipeId = equipes.body.dados[0].id;
  });

  afterAll(async () => {
    if (criados.length) await db.query('DELETE FROM pilotos WHERE id IN (?)', [criados]);
    await removerUsuarios([admin && admin.id]);
    await db.end();
  });

  it('1. Cadastra piloto como ADMIN (201) e devolve os 9 atributos enviados', async () => {
    const r = await criar({ atributos: { ...atributosValidos(), frenagem: 18, foco: 7 } });
    expect(r.status).toBe(201);
    expect(r.body.dados.atributos.frenagem).toBe(18);
    expect(r.body.dados.atributos.foco).toBe(7);
    expect(Object.keys(r.body.dados.atributos)).toHaveLength(9);
  });

  it('2. Rejeita cadastro com campos ausentes (400) listando os erros por campo', async () => {
    const r = await request(app).post('/api/pilotos').set(auth(tokenAdmin)).send({ nome: 'Piloto Incompleto' });
    expect(r.status).toBe(400);
    expect(r.body).toHaveProperty('status', 'erro');
    expect(Array.isArray(r.body.erros)).toBe(true);
    expect(r.body.erros.map((e) => e.campo)).toEqual(expect.arrayContaining(['pais', 'idade', 'salario_anual']));
  });

  it('3. Bloqueia escrita sem token (401) e com token adulterado (401)', async () => {
    const semToken = await request(app).post('/api/pilotos').send(pilotoValido());
    expect(semToken.status).toBe(401);
    const adulterado = await request(app).post('/api/pilotos').set(auth(tokenAdmin + 'x')).send(pilotoValido());
    expect(adulterado.status).toBe(401);
  });

  it('4. Bloqueia perfil sem permissão: ADMIN não usa a rota exclusiva de MANAGER (403) e visitante recebe 401', async () => {
    const admin403 = await request(app).post('/api/pilotos/restaurar').set(auth(tokenAdmin));
    expect(admin403.status).toBe(403);
    const visitante = await request(app).post('/api/pilotos/restaurar');
    expect(visitante.status).toBe(401);
  });

  it('5. Retorna 404 para piloto inexistente e 400 para identificador inválido', async () => {
    const inexistente = await request(app).get('/api/pilotos/999999');
    expect(inexistente.status).toBe(404);
    const invalido = await request(app).get('/api/pilotos/abc');
    expect(invalido.status).toBe(400);
  });

  it('6. REGRESSÃO: a listagem devolve os atributos reais de cada piloto (não o valor padrão)', async () => {
    const r = await request(app).get('/api/pilotos');
    expect(r.status).toBe(200);
    expect(r.body.dados.length).toBeGreaterThan(0);
    r.body.dados.forEach((p) => {
      expect(Object.keys(p.atributos)).toHaveLength(9);
      ATRIBUTOS.forEach((c) => expect(Number.isInteger(p.atributos[c])).toBe(true));
    });
    const todosIguaisA10 = r.body.dados.every((p) => ATRIBUTOS.every((c) => p.atributos[c] === 10));
    expect(todosIguaisA10).toBe(false);
  });

  it('7. Edição parcial (PUT só com salário): altera o salário e preserva atributos e estrelas', async () => {
    const criado = (await criar()).body.dados;
    const r = await request(app).put(`/api/pilotos/${criado.id}`).set(auth(tokenAdmin)).send({ salario_anual: 5555000 });
    expect(r.status).toBe(200);
    expect(r.body.dados.salario_anual).toBe(5555000);
    expect(r.body.dados.atributos).toEqual(criado.atributos);
    expect(r.body.dados.estrelas_atuais).toBe(criado.estrelas_atuais);
  });

  it('8. Edição de atributos e equipe: persiste, recalcula as estrelas e atualiza o status do contrato', async () => {
    // As equipes oficiais começam completas: abre uma vaga dispensando um piloto e devolve no final
    const membro = (await request(app).get('/api/pilotos')).body.dados.find((p) => p.equipe_id === equipeId);
    expect((await request(app).put(`/api/pilotos/${membro.id}`).set(auth(tokenAdmin)).send({ equipe_id: null })).status).toBe(200);

    const criado = (await criar()).body.dados;
    try {
      expect(criado.status_contrato).toBe('Disponivel');

      const r = await request(app).put(`/api/pilotos/${criado.id}`).set(auth(tokenAdmin))
        .send({ nome: 'Nome Editado', equipe_id: equipeId, atributos: atributosValidos(20) });
      expect(r.status).toBe(200);

      const lido = (await request(app).get(`/api/pilotos/${criado.id}`)).body.dados;
      expect(lido.nome).toBe('Nome Editado');
      expect(lido.equipe_id).toBe(equipeId);
      expect(lido.status_contrato).toBe('Contratado');
      expect(lido.atributos.curva).toBe(20);
      expect(lido.estrelas_atuais).toBe(5);
      expect(lido.overrall).toBe(100);
    } finally {
      await request(app).put(`/api/pilotos/${criado.id}`).set(auth(tokenAdmin)).send({ equipe_id: null });
      await request(app).put(`/api/pilotos/${membro.id}`).set(auth(tokenAdmin)).send({ equipe_id: equipeId });
    }
  });

  it('9. Edição inválida (atributo 25) retorna 400 e não altera o registro', async () => {
    const criado = (await criar()).body.dados;
    const r = await request(app).put(`/api/pilotos/${criado.id}`).set(auth(tokenAdmin)).send({ atributos: { frenagem: 25 } });
    expect(r.status).toBe(400);
    expect(r.body.erros[0].campo).toBe('atributos.frenagem');
    const lido = (await request(app).get(`/api/pilotos/${criado.id}`)).body.dados;
    expect(lido.atributos.frenagem).toBe(15);
  });

  it('10. Edição com equipe inexistente retorna 400; piloto inexistente retorna 404', async () => {
    const criado = (await criar()).body.dados;
    const equipeRuim = await request(app).put(`/api/pilotos/${criado.id}`).set(auth(tokenAdmin)).send({ equipe_id: 999999 });
    expect(equipeRuim.status).toBe(400);
    const naoExiste = await request(app).put('/api/pilotos/999999').set(auth(tokenAdmin)).send({ salario_anual: 1 });
    expect(naoExiste.status).toBe(404);
  });

  it('11. SEGURANÇA: tentativa de SQL Injection é tratada como texto e o banco permanece íntegro', async () => {
    const injecao = "x'); DROP TABLE pilotos; --";
    const r = await criar({ nome: injecao });
    expect(r.status).toBe(201);
    expect(r.body.dados.nome).toBe(injecao);
    const lista = await request(app).get('/api/pilotos');
    expect(lista.status).toBe(200);
    const porId = await request(app).get('/api/pilotos/1%20OR%201=1');
    expect(porId.status).toBe(400);
  });

  it('12. SEGURANÇA: payload XSS no nome é sanitizado antes de ser gravado', async () => {
    const r = await criar({ nome: '<img src=x onerror=alert(1)> Hacker' });
    expect(r.status).toBe(201);
    expect(r.body.dados.nome).not.toMatch(/[<>]/);
  });

  it('13. Remove piloto (200) e o segundo DELETE retorna 404', async () => {
    const criado = (await criar()).body.dados;
    const apagado = await request(app).delete(`/api/pilotos/${criado.id}`).set(auth(tokenAdmin));
    expect(apagado.status).toBe(200);
    const denovo = await request(app).delete(`/api/pilotos/${criado.id}`).set(auth(tokenAdmin));
    expect(denovo.status).toBe(404);
  });

  it('14. JSON malformado no corpo retorna 400 padronizado', async () => {
    const r = await request(app).post('/api/pilotos').set(auth(tokenAdmin))
      .set('Content-Type', 'application/json').send('{"nome": ');
    expect(r.status).toBe(400);
    expect(r.body).toHaveProperty('status', 'erro');
  });
});