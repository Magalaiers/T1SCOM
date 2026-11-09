// Testes da equipe que o MANAGER comanda (oficial ou criada por ele), do limite de elenco
// e do painel "Minha Equipe".
// Pré-requisitos: banco criado (database/schema.sql) e populado (npm run seed).
const request = require('supertest');
const app = require('../server');
const db = require('../src/config/db');
const { criarManager, criarAdmin, removerUsuarios } = require('./helpers');

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const nomeUnico = (prefixo) => `${prefixo} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const equipeValida = (extra = {}) => ({
  nome: nomeUnico('Equipe'), pais: 'Brasil', campeonato_id: 1, cor_primaria: '#112233', cor_secundaria: '#ffeedd', ...extra
});

const SINGLE_SEATER = 1;
const GT = 4;
const ENDURANCE = 6;

const listarPilotos = async (token) => (await request(app).get('/api/pilotos').set(token ? auth(token) : {})).body.dados;
const listarEquipes = async (token) => (await request(app).get('/api/equipes').set(token ? auth(token) : {})).body.dados;
const minhaEquipe = (token) => request(app).get('/api/equipes/minha').set(auth(token));
const assumir = (token, equipeId) => request(app).post('/api/equipes/minha/assumir').set(auth(token)).send({ equipe_id: equipeId });
const criarEquipe = (token, extra) => request(app).post('/api/equipes/minha').set(auth(token)).send(equipeValida(extra));
const deixar = (token) => request(app).delete('/api/equipes/minha').set(auth(token));
const mover = (token, pilotoId, equipeId) => request(app).put(`/api/pilotos/${pilotoId}`).set(auth(token)).send({ equipe_id: equipeId });
const agentesLivres = async (token) => (await listarPilotos(token)).filter((p) => p.equipe_id === null);

// Contrata N agentes livres; devolve o status de cada tentativa
async function contratar(token, equipeId, quantidade) {
  const livres = await agentesLivres(token);
  const status = [];
  for (let i = 0; i < quantidade; i++) status.push((await mover(token, livres[i].id, equipeId)).status);
  return status;
}

describe('Equipe do MANAGER (oficial ou criada) e limite de elenco', () => {
  let admin;
  let ana;
  let bruno;
  let carla;
  let dani;
  let eva;
  let fabio;
  let oficial; // uma equipe oficial usada nos testes (começa completa, como no jogo)
  const extras = [];

  beforeAll(async () => {
    admin = await criarAdmin(app);
    [ana, bruno, carla, dani, eva, fabio] = await Promise.all([1, 2, 3, 4, 5, 6].map(() => criarManager(app)));
    oficial = (await listarEquipes())[0];
  });

  afterAll(async () => {
    await removerUsuarios([admin.id, ana.id, bruno.id, carla.id, dani.id, eva.id, fabio.id, ...extras]);
    await db.end();
  });

  it('E1. Sem equipe: GET /minha retorna 404; a lista traz só equipes oficiais, cada uma com seu limite de elenco', async () => {
    expect((await minhaEquipe(ana.token)).status).toBe(404);

    const doManager = await listarEquipes(ana.token);
    expect(doManager.length).toBe((await listarEquipes()).length);
    expect(doManager.every((e) => e.propria === false && e.elenco_maximo >= 3)).toBe(true);
    // oficiais começam completas: o limite é o elenco que vieram do jogo
    const noCatalogo = (await listarPilotos()).filter((p) => p.equipe_id === oficial.id).length;
    expect(oficial.elenco_maximo).toBe(noCatalogo);
  });

  it('E2. Assumir uma equipe oficial: o painel traz o elenco real dela e nada da equipe compartilhada muda', async () => {
    const r = await assumir(ana.token, oficial.id);
    expect(r.status).toBe(201);
    expect(r.body.dados).toMatchObject({ id: oficial.id, tipo: 'oficial', propria: false });

    const { equipe, resumo, elenco } = (await minhaEquipe(ana.token)).body.dados;
    expect(equipe.tipo).toBe('oficial');
    expect(resumo.total_pilotos).toBe(oficial.elenco_maximo);
    expect(elenco).toHaveLength(oficial.elenco_maximo);

    const nomesNoCatalogo = (await listarPilotos()).filter((p) => p.equipe_id === oficial.id).map((p) => p.nome).sort();
    expect(elenco.map((p) => p.nome).sort()).toEqual(nomesNoCatalogo);
    expect((await listarEquipes()).some((e) => e.id === oficial.id && e.propria === false)).toBe(true);
  });

  it('E3. Dois MANAGERs comandam a mesma equipe oficial sem se afetar (cada um tem a sua cópia)', async () => {
    expect((await assumir(bruno.token, oficial.id)).status).toBe(201);

    const doAna = (await minhaEquipe(ana.token)).body.dados.elenco[0];
    expect((await mover(ana.token, doAna.id, null)).status).toBe(200); // Ana dispensa um piloto

    expect((await minhaEquipe(ana.token)).body.dados.resumo.total_pilotos).toBe(oficial.elenco_maximo - 1);
    expect((await minhaEquipe(bruno.token)).body.dados.resumo.total_pilotos).toBe(oficial.elenco_maximo);
    const noCatalogo = (await listarPilotos()).filter((p) => p.equipe_id === oficial.id).length;
    expect(noCatalogo).toBe(oficial.elenco_maximo);
  });

  it('E4. Limite de elenco: com vaga a contratação funciona; equipe completa recusa (400)', async () => {
    const [livreAna] = await agentesLivres(ana.token);
    expect((await mover(ana.token, livreAna.id, oficial.id)).status).toBe(200); // ocupa a vaga que ela abriu

    const [outroLivre] = await agentesLivres(ana.token);
    const cheia = await mover(ana.token, outroLivre.id, oficial.id);
    expect(cheia.status).toBe(400);
    expect(cheia.body.erros[0].campo).toBe('equipe_id');
    expect(cheia.body.erros[0].mensagem).toMatch(/completa/);

    const [livreBruno] = await agentesLivres(bruno.token);
    expect((await mover(bruno.token, livreBruno.id, oficial.id)).status).toBe(400); // a de Bruno também está cheia
  });

  it('E5. Equipe oficial é somente leitura: PUT /minha retorna 403', async () => {
    const r = await request(app).put('/api/equipes/minha').set(auth(ana.token)).send({ nome: 'Outro Nome' });
    expect(r.status).toBe(403);
    expect((await listarEquipes()).find((e) => e.id === oficial.id).nome).toBe(oficial.nome);
  });

  it('E6. Quem já comanda uma equipe não assume nem cria outra (409)', async () => {
    const outraOficial = (await listarEquipes())[1];
    expect((await assumir(ana.token, outraOficial.id)).status).toBe(409);
    expect((await criarEquipe(ana.token)).status).toBe(409);
  });

  it('E7. Deixar a equipe oficial: o elenco continua como está e a equipe segue existindo para todos', async () => {
    const r = await deixar(ana.token);
    expect(r.status).toBe(200);
    expect(r.body.dados.tipo).toBe('oficial');
    expect((await minhaEquipe(ana.token)).status).toBe(404);

    expect((await listarEquipes()).some((e) => e.id === oficial.id)).toBe(true);
    const aindaNaEquipe = (await listarPilotos(ana.token)).filter((p) => p.equipe_id === oficial.id).length;
    expect(aindaNaEquipe).toBe(oficial.elenco_maximo);
  });

  it('E8. Criar equipe própria: já passa a comandá-la e só o dono a enxerga', async () => {
    const dados = equipeValida({ nome: nomeUnico('Resistência da Dani'), campeonato_id: ENDURANCE });
    const r = await request(app).post('/api/equipes/minha').set(auth(dani.token)).send(dados);
    expect(r.status).toBe(201);
    expect(r.body.dados).toMatchObject({ tipo: 'criada', propria: true, tipo_campeonato: 'Endurance', elenco_maximo: 6, cor_primaria: '#112233' });

    const painel = (await minhaEquipe(dani.token)).body.dados;
    expect(painel.equipe.tipo).toBe('criada');
    expect(painel.resumo).toEqual({ total_pilotos: 0, folha_salarial: 0, media_estrelas: 0, media_potencial: 0, pilotos_pagantes: 0 });

    expect((await listarEquipes(dani.token))[0].nome).toBe(dados.nome); // a própria vem primeiro
    for (const token of [bruno.token, admin.token, undefined]) {
      expect((await listarEquipes(token)).some((e) => e.nome === dados.nome)).toBe(false);
    }
  });

  it('E9. SEGURANÇA: ninguém assume a equipe criada por outro MANAGER (404) nem põe pilotos nela (400)', async () => {
    const equipeDaDani = (await minhaEquipe(dani.token)).body.dados.equipe;

    expect((await assumir(carla.token, equipeDaDani.id)).status).toBe(404);
    const pilotoDaCarla = (await listarPilotos(carla.token))[0];
    const r = await mover(carla.token, pilotoDaCarla.id, equipeDaDani.id);
    expect(r.status).toBe(400);
    const pilotoDoCatalogo = (await listarPilotos())[0];
    expect((await mover(admin.token, pilotoDoCatalogo.id, equipeDaDani.id)).status).toBe(400);
  });

  it('E10. Limite por categoria nas equipes criadas: Endurance até 6; GT e Single Seater até 3', async () => {
    const equipeDaDani = (await minhaEquipe(dani.token)).body.dados.equipe;
    const seis = await contratar(dani.token, equipeDaDani.id, 6);
    expect(seis).toEqual([200, 200, 200, 200, 200, 200]);
    const [livre] = await agentesLivres(dani.token);
    expect((await mover(dani.token, livre.id, equipeDaDani.id)).status).toBe(400);

    const gt = await request(app).post('/api/equipes/minha').set(auth(eva.token)).send(equipeValida({ campeonato_id: GT }));
    expect(gt.body.dados.elenco_maximo).toBe(3);
    expect(await contratar(eva.token, gt.body.dados.id, 3)).toEqual([200, 200, 200]);
    const [livreEva] = await agentesLivres(eva.token);
    expect((await mover(eva.token, livreEva.id, gt.body.dados.id)).status).toBe(400);
  });

  it('E11. Editar equipe criada: cores normalizadas; reduzir o limite com elenco maior é recusado; excluir libera os pilotos', async () => {
    const criada = await request(app).post('/api/equipes/minha').set(auth(fabio.token)).send(equipeValida({ campeonato_id: ENDURANCE }));
    const equipeId = criada.body.dados.id;
    await contratar(fabio.token, equipeId, 5);

    const editou = await request(app).put('/api/equipes/minha').set(auth(fabio.token)).send({ cor_primaria: '#AABBCC' });
    expect(editou.status).toBe(200);
    expect(editou.body.dados.cor_primaria).toBe('#aabbcc');

    const reduzir = await request(app).put('/api/equipes/minha').set(auth(fabio.token)).send({ campeonato_id: SINGLE_SEATER });
    expect(reduzir.status).toBe(400);
    expect(reduzir.body.erros[0].campo).toBe('campeonato_id');
    expect((await minhaEquipe(fabio.token)).body.dados.equipe.tipo_campeonato).toBe('Endurance'); // nada mudou

    const r = await deixar(fabio.token);
    expect(r.status).toBe(200);
    expect(r.body.dados).toEqual({ tipo: 'criada', pilotos_liberados: 5 });
    expect((await minhaEquipe(fabio.token)).status).toBe(404);

    const lista = await listarPilotos(fabio.token);
    expect(lista.filter((p) => p.equipe_id === equipeId)).toHaveLength(0);
    expect(lista.filter((p) => p.equipe_id === null && p.status_contrato === 'Contratado')).toHaveLength(0);
    expect((await criarEquipe(fabio.token)).status).toBe(201); // pode começar de novo
  });

  it('E12. Validação: cor inválida, nome curto, campeonato inexistente e nome de equipe oficial', async () => {
    const corRuim = await criarEquipe(carla.token, { cor_primaria: 'vermelho' });
    expect(corRuim.status).toBe(400);
    expect(corRuim.body.erros.map((e) => e.campo)).toContain('cor_primaria');
    expect((await criarEquipe(carla.token, { nome: 'A' })).status).toBe(400);

    const semCampeonato = await criarEquipe(carla.token, { campeonato_id: 99999 });
    expect(semCampeonato.status).toBe(400);
    expect(semCampeonato.body.erros[0].campo).toBe('campeonato_id');

    expect((await criarEquipe(carla.token, { nome: oficial.nome })).status).toBe(409);
    expect((await request(app).post('/api/equipes/minha/assumir').set(auth(carla.token)).send({ equipe_id: 'abc' })).status).toBe(400);
    expect((await assumir(carla.token, 999999)).status).toBe(404);
    expect((await minhaEquipe(carla.token)).status).toBe(404); // nada disso criou ou ligou equipe
  });

  it('E13. ADMIN não comanda equipe (403) e o visitante recebe 401', async () => {
    expect((await request(app).get('/api/equipes/minha').set(auth(admin.token))).status).toBe(403);
    expect((await assumir(admin.token, oficial.id)).status).toBe(403);
    expect((await request(app).post('/api/equipes/minha').set(auth(admin.token)).send(equipeValida())).status).toBe(403);
    expect((await request(app).get('/api/equipes/minha')).status).toBe(401);
    expect((await request(app).post('/api/equipes/minha/assumir').send({ equipe_id: oficial.id })).status).toBe(401);
  });

  it('E14. "Restaurar meus dados" desfaz a equipe comandada (oficial ou criada) e volta o elenco ao catálogo', async () => {
    expect((await assumir(ana.token, oficial.id)).status).toBe(201);
    const r = await request(app).post('/api/pilotos/restaurar').set(auth(ana.token));
    expect(r.status).toBe(200);
    expect((await minhaEquipe(ana.token)).status).toBe(404);

    expect((await request(app).post('/api/pilotos/restaurar').set(auth(dani.token))).status).toBe(200);
    expect((await minhaEquipe(dani.token)).status).toBe(404);
    expect((await listarPilotos(dani.token)).length).toBe((await listarPilotos()).length);
  });

  it('E15. SEGURANÇA: excluir o usuário apaga a equipe criada por ele e a ligação com a equipe comandada (cascata)', async () => {
    const gabi = await criarManager(app);
    const hugo = await criarManager(app);
    extras.push(gabi.id, hugo.id);
    expect((await criarEquipe(gabi.token)).status).toBe(201);
    expect((await assumir(hugo.token, oficial.id)).status).toBe(201);

    await db.execute('DELETE FROM usuarios WHERE id IN (?, ?)', [gabi.id, hugo.id]);
    const [equipes] = await db.execute('SELECT COUNT(*) AS total FROM equipes WHERE dono_id = ?', [gabi.id]);
    const [ligacoes] = await db.execute('SELECT COUNT(*) AS total FROM equipe_comandada WHERE usuario_id IN (?, ?)', [gabi.id, hugo.id]);
    expect(Number(equipes[0].total)).toBe(0);
    expect(Number(ligacoes[0].total)).toBe(0);
    expect((await listarEquipes()).some((e) => e.id === oficial.id)).toBe(true); // a oficial continua
  });

  it('E16. GET /api/campeonatos é público e informa o limite de elenco por tipo', async () => {
    const r = await request(app).get('/api/campeonatos');
    expect(r.status).toBe(200);
    const limite = (tipo) => r.body.dados.filter((c) => c.tipo === tipo).map((c) => c.elenco_maximo);
    expect(limite('Endurance').every((n) => n === 6)).toBe(true);
    expect(limite('GT').every((n) => n === 3)).toBe(true);
    expect(limite('Single Seater').every((n) => n === 3)).toBe(true);
  });

  it('E17. SEGURANÇA: o nome da equipe é sanitizado (sem < >) antes de ser gravado', async () => {
    const ivo = await criarManager(app);
    extras.push(ivo.id);
    const r = await criarEquipe(ivo.token, { nome: '<img src=x onerror=alert(1)> Evil' });
    expect(r.status).toBe(201);
    expect(r.body.dados.nome).not.toMatch(/[<>]/);
  });
});