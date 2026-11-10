// Popula o banco com os dados extraídos do jogo no Trabalho 1 (dados.json).
// Uso: npm run seed   (rode antes: database/schema.sql)
//
// Cria também o usuário ADMIN inicial a partir do .env (ADMIN_NOME, ADMIN_EMAIL,
// ADMIN_SENHA), para que nenhuma credencial fique escrita no repositório.
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const pool = require('./src/config/db');
const pilotoRepo = require('./src/repositories/pilotoRepository');
const { ATRIBUTOS, SERIES, calcularEstrelasAtuais } = require('./src/utils/validators');

// O Teams.csv do jogo NÃO informa o campeonato de cada equipe (o conversor do Trabalho 1 gravava todas no
// campeonato 1). Essa informação está na ORDEM das equipes no arquivo: elas vêm em blocos consecutivos, um por
// campeonato. Duas conferências nos dados do jogo sustentam essa leitura:
//  1) dentro de cada tipo de série, a habilidade e o salário médios dos pilotos caem de um bloco para o seguinte
//     (Single Seater: 14,9 -> 11,2 -> 8,3 | GT: 13,0 -> 10,3 | Endurance: 13,4 -> 10,9);
//  2) as 12 equipes de 6 pilotos são exatamente os dois últimos blocos (as de Endurance).
// O resultado foi conferido equipe por equipe com a tabela de equipes por campeonato do jogo (62 de 62) e o teste K3
// (tests/campeonatos.test.js) o trava. Cada item abaixo é um bloco, na ordem do arquivo: `campeonato` é o id em
// dados.campeonatos e `equipes` é quantas equipes o bloco tem.
const BLOCOS_DE_EQUIPES = [
  { campeonato: 1, equipes: 10 }, // World Motorsport Championship (Single Seater, Tier 1)
  { campeonato: 2, equipes: 10 }, // Asia-Pacific Super Cup (Single Seater, Tier 2)
  { campeonato: 3, equipes: 10 }, // European Racing Series (Single Seater, Tier 3)
  { campeonato: 4, equipes: 10 }, // International GT Championship (GT, Tier 1)
  { campeonato: 5, equipes: 10 }, // GT Challenger Series (GT, Tier 2)
  { campeonato: 6, equipes: 6 },  // International Endurance Cup, Class A (Endurance, Tier 1)
  { campeonato: 7, equipes: 6 }   // International Endurance Cup, Class B (Endurance, Tier 2)
];

// Id do campeonato da equipe na posição `indice` (0 = primeira equipe do arquivo)
function campeonatoDaPosicao(indice) {
  let restante = indice;
  for (const bloco of BLOCOS_DE_EQUIPES) {
    if (restante < bloco.equipes) return bloco.campeonato;
    restante -= bloco.equipes;
  }
  throw new Error(`Equipe na posição ${indice} sem campeonato: confira BLOCOS_DE_EQUIPES.`);
}

const COLUNAS_PILOTO = [
  'id', 'nome', 'pais', 'idade', 'salario_anual', 'series_preference', 'pay_driver',
  'marketability', 'status_contrato', 'equipe_id', ...ATRIBUTOS,
  'estrelas_atuais', 'estrelas_potencial'
];

function montarLinhaPiloto(p) {
  const atributos = ATRIBUTOS.map((chave) => {
    const valor = Number(p.atributos && p.atributos[chave]);
    if (!Number.isFinite(valor)) throw new Error(`Piloto ${p.id} (${p.nome}) sem o atributo "${chave}"`);
    return Math.max(0, Math.min(20, Math.round(valor)));
  });
  const mapaAtributos = Object.fromEntries(ATRIBUTOS.map((c, i) => [c, atributos[i]]));

  const atuais = Number(p.estrelas_atuais) > 0 ? Number(p.estrelas_atuais) : calcularEstrelasAtuais(mapaAtributos);
  const potencial = Math.min(5, Math.max(atuais, Number(p.estrelas_potencial) || atuais));
  const marketability = Math.max(0, Math.min(100, parseInt(String(p.marketability).replace('%', ''), 10) || 0));
  const equipeId = p.equipe_id || null;

  return [
    p.id,
    p.nome,
    p.nacionalidade || p.pais || 'Internacional',
    p.idade,
    Number(p.salario_anual) || 0,
    SERIES.includes(p.series_preference) ? p.series_preference : 'Any',
    p.pay_driver ? 1 : 0,
    marketability,
    equipeId ? 'Contratado' : 'Disponivel',
    equipeId,
    ...atributos,
    atuais,
    potencial
  ];
}

async function criarAdminInicial(conexao) {
  const { ADMIN_NOME, ADMIN_EMAIL, ADMIN_SENHA } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_SENHA) {
    console.warn('[AVISO] ADMIN_EMAIL/ADMIN_SENHA não definidos no .env: nenhum usuário ADMIN foi criado.');
    return;
  }
  const email = ADMIN_EMAIL.trim().toLowerCase();
  const [existente] = await conexao.execute('SELECT id FROM usuarios WHERE email = ?', [email]);
  if (existente.length > 0) {
    console.log(`[INFO] Usuário ${email} já existe: mantido sem alterações.`);
    return;
  }
  const hash = await bcrypt.hash(ADMIN_SENHA, 10);
  await conexao.execute(
    'INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES (?, ?, ?, ?)',
    [ADMIN_NOME || 'Administrador', email, hash, 'ADMIN']
  );
  console.log(`[INFO] Usuário ADMIN criado: ${email}`);
}

async function popularBancoDeDados() {
  let conexao;
  try {
    const dados = JSON.parse(fs.readFileSync(path.join(__dirname, 'dados.json'), 'utf-8'));
    const totalEsperado = BLOCOS_DE_EQUIPES.reduce((soma, bloco) => soma + bloco.equipes, 0);
    const idsDosCampeonatos = new Set(dados.campeonatos.map((c) => c.id));
    if (dados.equipes.length !== totalEsperado || BLOCOS_DE_EQUIPES.some((bloco) => !idsDosCampeonatos.has(bloco.campeonato))) {
      throw new Error(`dados.json fora do esperado: ${dados.equipes.length} equipes (esperado ${totalEsperado}) ou campeonato inexistente. `
        + 'Ajuste BLOCOS_DE_EQUIPES no seed.js.');
    }
    conexao = await pool.getConnection();

    await conexao.query('SET FOREIGN_KEY_CHECKS = 0');
    await conexao.query('TRUNCATE TABLE pilotos');
    await conexao.query('TRUNCATE TABLE equipe_comandada');
    await conexao.query('TRUNCATE TABLE equipes');
    await conexao.query('TRUNCATE TABLE campeonatos');
    await conexao.query('SET FOREIGN_KEY_CHECKS = 1');

    await conexao.beginTransaction();

    for (const c of dados.campeonatos) {
      await conexao.execute(
        'INSERT INTO campeonatos (id, nome, tipo, categoria) VALUES (?, ?, ?, ?)',
        [c.id, c.nome, c.tipo, c.categoria]
      );
    }

    const equipesEmOrdem = [...dados.equipes].sort((a, b) => a.id - b.id);
    for (const [indice, e] of equipesEmOrdem.entries()) {
      await conexao.execute(
        'INSERT INTO equipes (id, nome, pais, campeonato_id, cor_primaria, cor_secundaria) VALUES (?, ?, ?, ?, ?, ?)',
        [e.id, e.nome, e.pais || 'Internacional', campeonatoDaPosicao(indice), e.cor_primaria || '#383e4d', e.cor_secundaria || '#ffffff']
      );
    }

    const sqlPiloto = `INSERT INTO pilotos (${COLUNAS_PILOTO.join(', ')}) VALUES (${COLUNAS_PILOTO.map(() => '?').join(', ')})`;
    for (const p of dados.pilotos) {
      await conexao.execute(sqlPiloto, montarLinhaPiloto(p));
    }

    // Cada MANAGER já cadastrado recebe uma cópia pessoal do catálogo recém-criado
    const [gerentes] = await conexao.query("SELECT id FROM usuarios WHERE perfil = 'MANAGER'");
    for (const gerente of gerentes) {
      await pilotoRepo.copiarCatalogoPara(gerente.id, conexao);
    }

    await conexao.commit();
    console.log(`[OK] Banco populado: ${dados.campeonatos.length} campeonatos, ${dados.equipes.length} equipes, ${dados.pilotos.length} pilotos no catálogo-modelo.`);
    console.log(`[OK] ${gerentes.length} usuário(s) MANAGER já cadastrado(s) receberam uma cópia do catálogo.`);

    await criarAdminInicial(conexao);
  } catch (erro) {
    if (conexao) await conexao.rollback().catch(() => {});
    console.error('[ERRO] Falha ao popular o banco de dados:', erro.message);
    process.exitCode = 1;
  } finally {
    if (conexao) conexao.release();
    await pool.end();
  }
}

popularBancoDeDados();