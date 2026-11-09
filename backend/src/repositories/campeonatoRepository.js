// Acesso a dados de campeonatos: todo o SQL da tabela `campeonatos` fica aqui.
const db = require('../config/db');
const { limitePorTipoSql } = require('../utils/regrasElenco');

// elenco_maximo = limite de pilotos de uma equipe criada nesse campeonato (regra por tipo)
const COLUNAS = `id, nome, tipo, categoria, ${limitePorTipoSql('tipo')} AS elenco_maximo`;

const normalizar = (c) => ({ ...c, elenco_maximo: Number(c.elenco_maximo) });

async function listar() {
  const [linhas] = await db.query(`SELECT ${COLUNAS} FROM campeonatos ORDER BY id ASC`);
  return linhas.map(normalizar);
}

async function buscarPorId(id) {
  const [linhas] = await db.execute(`SELECT ${COLUNAS} FROM campeonatos WHERE id = ?`, [id]);
  return linhas[0] ? normalizar(linhas[0]) : null;
}

module.exports = { listar, buscarPorId };