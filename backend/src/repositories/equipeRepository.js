// Acesso a dados de equipes: todo o SQL das tabelas `equipes` e `equipe_comandada` fica aqui.
//
// Equipes oficiais têm dono_id NULL (compartilhadas, somente leitura).
// A equipe CRIADA por um MANAGER tem dono_id = id dele (no máximo uma, garantido pelo banco).
// Qual equipe o MANAGER comanda (oficial ou criada) fica em `equipe_comandada`.
const db = require('../config/db');
const { limitePorTipoSql } = require('../utils/regrasElenco');

// elenco_maximo: a regra por tipo de campeonato, nunca abaixo do elenco original da equipe oficial
const SELECT_EQUIPE = `
  SELECT e.id, e.nome, e.pais, e.campeonato_id,
         c.nome AS nome_campeonato, c.tipo AS tipo_campeonato,
         e.cor_primaria, e.cor_secundaria,
         (e.dono_id IS NOT NULL) AS propria,
         GREATEST(
           ${limitePorTipoSql('c.tipo')},
           (SELECT COUNT(*) FROM pilotos pc WHERE pc.equipe_id = e.id AND pc.dono_id IS NULL)
         ) AS elenco_maximo
  FROM equipes e
  JOIN campeonatos c ON c.id = e.campeonato_id
`;

const normalizar = (e) => (e ? { ...e, elenco_maximo: Number(e.elenco_maximo) } : null);

// Oficiais + a criada pelo próprio usuário (donoId null = só as oficiais). A própria vem primeiro.
async function listarVisiveis(donoId) {
  const [equipes] = await db.execute(
    `${SELECT_EQUIPE} WHERE e.dono_id IS NULL OR e.dono_id <=> ? ORDER BY propria DESC, e.nome ASC`,
    [donoId]
  );
  return equipes.map(normalizar);
}

// Equipe que quem consulta pode enxergar: oficial ou a própria (donoId null = só as oficiais)
async function buscarVisivel(id, donoId) {
  const [linhas] = await db.execute(
    `${SELECT_EQUIPE} WHERE e.id = ? AND (e.dono_id IS NULL OR e.dono_id <=> ?)`,
    [id, donoId]
  );
  return normalizar(linhas[0]);
}

// A equipe que o usuário comanda agora (oficial ou criada por ele), ou null
async function buscarComandada(usuarioId) {
  const [linhas] = await db.execute(
    `${SELECT_EQUIPE} JOIN equipe_comandada ec ON ec.equipe_id = e.id WHERE ec.usuario_id = ?`,
    [usuarioId]
  );
  return normalizar(linhas[0]);
}

async function nomeOficialExiste(nome) {
  const [linhas] = await db.execute('SELECT id FROM equipes WHERE dono_id IS NULL AND nome = ?', [nome]);
  return linhas.length > 0;
}

// Retorna o ID gerado. Aceita uma conexão para participar de uma transação.
// (o banco recusa uma segunda equipe criada pelo mesmo dono: ER_DUP_ENTRY)
async function inserir(dados, donoId, conexao = db) {
  const [resultado] = await conexao.execute(
    'INSERT INTO equipes (nome, pais, campeonato_id, cor_primaria, cor_secundaria, dono_id) VALUES (?, ?, ?, ?, ?, ?)',
    [dados.nome, dados.pais, dados.campeonato_id, dados.cor_primaria, dados.cor_secundaria, donoId]
  );
  return resultado.insertId;
}

async function atualizar(donoId, dados) {
  await db.execute(
    'UPDATE equipes SET nome = ?, pais = ?, campeonato_id = ?, cor_primaria = ?, cor_secundaria = ? WHERE dono_id = ?',
    [dados.nome, dados.pais, dados.campeonato_id, dados.cor_primaria, dados.cor_secundaria, donoId]
  );
}

// Apaga a equipe CRIADA pelo usuário (a ligação em equipe_comandada some junto, por cascata)
async function excluirDoDono(donoId, conexao = db) {
  const [resultado] = await conexao.execute('DELETE FROM equipes WHERE dono_id = ?', [donoId]);
  return resultado.affectedRows > 0;
}

// O banco recusa um segundo registro do mesmo usuário (PK): ER_DUP_ENTRY
async function comandar(usuarioId, equipeId, conexao = db) {
  await conexao.execute('INSERT INTO equipe_comandada (usuario_id, equipe_id) VALUES (?, ?)', [usuarioId, equipeId]);
}

async function deixarDeComandar(usuarioId, conexao = db) {
  const [resultado] = await conexao.execute('DELETE FROM equipe_comandada WHERE usuario_id = ?', [usuarioId]);
  return resultado.affectedRows > 0;
}

// Números do painel "Minha Equipe", calculados pelo banco (sobre a cópia de pilotos do usuário)
async function resumo(equipeId, donoId) {
  const [[linha]] = await db.execute(
    `SELECT COUNT(*) AS total_pilotos,
            COALESCE(SUM(salario_anual), 0) AS folha_salarial,
            COALESCE(ROUND(AVG(estrelas_atuais), 1), 0) AS media_estrelas,
            COALESCE(ROUND(AVG(estrelas_potencial), 1), 0) AS media_potencial,
            COALESCE(SUM(pay_driver), 0) AS pilotos_pagantes
     FROM pilotos WHERE equipe_id = ? AND dono_id = ?`,
    [equipeId, donoId]
  );
  return {
    total_pilotos: Number(linha.total_pilotos),
    folha_salarial: Number(linha.folha_salarial),
    media_estrelas: Number(linha.media_estrelas),
    media_potencial: Number(linha.media_potencial),
    pilotos_pagantes: Number(linha.pilotos_pagantes)
  };
}

async function listarElenco(equipeId, donoId) {
  const [linhas] = await db.execute(
    `SELECT id, nome, pais, idade, estrelas_atuais, estrelas_potencial, salario_anual, pay_driver
     FROM pilotos WHERE equipe_id = ? AND dono_id = ?
     ORDER BY estrelas_atuais DESC, nome ASC`,
    [equipeId, donoId]
  );
  return linhas.map((p) => ({
    id: p.id,
    nome: p.nome,
    pais: p.pais,
    idade: p.idade,
    estrelas_atuais: Number(p.estrelas_atuais),
    estrelas_potencial: Number(p.estrelas_potencial),
    salario_anual: Number(p.salario_anual),
    pay_driver: Boolean(p.pay_driver)
  }));
}

module.exports = {
  listarVisiveis, buscarVisivel, buscarComandada, nomeOficialExiste, inserir, atualizar,
  excluirDoDono, comandar, deixarDeComandar, resumo, listarElenco
};