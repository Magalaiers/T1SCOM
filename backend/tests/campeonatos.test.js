// Distribuição das equipes oficiais pelos campeonatos. O Teams.csv do jogo não informa o campeonato de cada
// equipe; o seed o deriva da posição da equipe no arquivo (blocos de 10, 10, 10, 10, 10, 6 e 6), e o teste K3
// confere o resultado com a tabela de equipes do jogo.
// Pré-requisito: banco criado pelo database/schema.sql e populado (npm run seed).
const request = require('supertest');
const app = require('../server');
const db = require('../src/config/db');

// Tabela de equipes por campeonato do jogo (conferida equipe por equipe). Os nomes são os do Teams.csv: a wiki do jogo
// escreve "Panther Racing Team", o arquivo do jogo (e, portanto, o banco) "Panther Race Team".
const TABELA_DO_JOGO = {
  'World Motorsport Championship': [
    'Steinmann Motorsport', 'Scuderia Rossini', 'Panther Race Team', 'Windsor Racing', 'Kitano Sport',
    'Van Dort Racing', 'Rezzato Corsa', 'Thornton Motorsport', 'Vélan Racing', 'Chariot Motor Group'
  ],
  'Asia-Pacific Super Cup': [
    'Boa Esperança', 'MacNeil Racing Team', 'Espirit GP', 'MRT Valbuena', 'Team Kirov',
    'Ruiz Motorsport', 'Lucatelli Racing', 'Ozu Motor Team', 'Zampelli Engineering', 'Krüger Motorsport'
  ],
  'European Racing Series': [
    'Garuda Racing', 'Eastwood Motorsport', 'Firebird MRT', 'Silva Racing', 'Vexala Motorsport',
    'Octane Racing', 'Dragon Race Team China', 'Archer BMR', 'ZRT Autosport', 'Predator Racing Group'
  ],
  'International GT Championship': [
    'Hammer AMR', 'Spartan MRT', 'Otsuno Racing', 'Oranje GT', 'Wolfhagen Racing',
    'Toruń GT', 'Lockhart Motorsport', 'Dogtooth Lake Motor Group', 'Oberhof Racing Team', 'Vittorio Corsa'
  ],
  'GT Challenger Series': [
    'Skanström GT', 'Team Nordhagen', 'Nakata Performance', 'Grand Slam Autosport', 'Marshall GT',
    'Orléans AMR', 'Yuma Race Team', 'Magyar Engineering', 'Nicholson Racing', 'Oakham MRT'
  ],
  'International Endurance Cup (Class A)': [
    'Shimizu Boom', 'Pamplona Racing', 'Bexbach Sport', 'Montpellier Motorsport', 'Lancaster Performance', 'Equipe Milesse'
  ],
  'International Endurance Cup (Class B)': [
    'Tony Zang Motorsport', 'Kandersteg EP', 'Lampang Endurance', 'Le Roux Compétition', 'Russian Oil Racing', 'Sangju Tigers'
  ]
};

describe('Equipes oficiais por campeonato', () => {
  let equipes;

  beforeAll(async () => {
    equipes = (await request(app).get('/api/equipes')).body.dados;
  });

  afterAll(async () => {
    await db.end();
  });

  it('K1. As 62 equipes oficiais estão distribuídas 10/10/10/10/10/6/6 pelos 7 campeonatos (e não todas no primeiro)', () => {
    expect(equipes).toHaveLength(62);
    const porCampeonato = {};
    equipes.forEach((e) => { porCampeonato[e.campeonato_id] = (porCampeonato[e.campeonato_id] || 0) + 1; });
    expect(porCampeonato).toEqual({ 1: 10, 2: 10, 3: 10, 4: 10, 5: 10, 6: 6, 7: 6 });
  });

  it('K2. O limite de elenco segue o tipo do campeonato (Endurance 6, demais 3) e coincide com os pilotos reais de cada equipe', async () => {
    const pilotos = (await request(app).get('/api/pilotos')).body.dados;
    const porEquipe = {};
    pilotos.forEach((p) => { if (p.equipe_id) porEquipe[p.equipe_id] = (porEquipe[p.equipe_id] || 0) + 1; });

    equipes.forEach((e) => {
      const esperado = e.tipo_campeonato === 'Endurance' ? 6 : 3;
      expect(e.elenco_maximo).toBe(esperado);
      expect(porEquipe[e.id]).toBe(esperado); // os dados do jogo e a regra concordam em todas as 62 equipes
    });
  });

  it('K3. Cada uma das 62 equipes está no campeonato indicado pela tabela de equipes do jogo', () => {
    const noBanco = {};
    equipes.forEach((e) => {
      if (!noBanco[e.nome_campeonato]) noBanco[e.nome_campeonato] = [];
      noBanco[e.nome_campeonato].push(e.nome);
    });

    expect(Object.keys(noBanco).sort()).toEqual(Object.keys(TABELA_DO_JOGO).sort());
    Object.keys(TABELA_DO_JOGO).forEach((campeonato) => {
      expect(noBanco[campeonato].sort()).toEqual([...TABELA_DO_JOGO[campeonato]].sort());
    });
  });
});