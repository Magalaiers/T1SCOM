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
const { ATRIBUTOS, SERIES, calcularEstrelasAtuais } = require('./src/utils/validators');

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
    conexao = await pool.getConnection();

    await conexao.query('SET FOREIGN_KEY_CHECKS = 0');
    await conexao.query('TRUNCATE TABLE pilotos');
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

    for (const e of dados.equipes) {
      await conexao.execute(
        'INSERT INTO equipes (id, nome, pais, campeonato_id, cor_primaria, cor_secundaria) VALUES (?, ?, ?, ?, ?, ?)',
        [e.id, e.nome, e.pais || 'Internacional', e.campeonato_id, e.cor_primaria || '#383e4d', e.cor_secundaria || '#ffffff']
      );
    }

    const sqlPiloto = `INSERT INTO pilotos (${COLUNAS_PILOTO.join(', ')}) VALUES (${COLUNAS_PILOTO.map(() => '?').join(', ')})`;
    for (const p of dados.pilotos) {
      await conexao.execute(sqlPiloto, montarLinhaPiloto(p));
    }

    await conexao.commit();
    console.log(`[OK] Banco populado: ${dados.campeonatos.length} campeonatos, ${dados.equipes.length} equipes, ${dados.pilotos.length} pilotos.`);

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
