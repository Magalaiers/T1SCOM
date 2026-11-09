// Acesso a dados de equipes: todo o SQL da tabela `equipes` fica aqui.
const db = require('../config/db');

async function listarComCampeonato() {
  const [equipes] = await db.query(`
    SELECT e.id, e.nome, e.pais, e.campeonato_id, c.nome AS nome_campeonato,
           e.cor_primaria, e.cor_secundaria
    FROM equipes e
    JOIN campeonatos c ON c.id = e.campeonato_id
    ORDER BY e.nome ASC
  `);
  return equipes;
}

async function existe(id) {
  const [linhas] = await db.execute('SELECT id FROM equipes WHERE id = ?', [id]);
  return linhas.length > 0;
}

module.exports = { listarComCampeonato, existe };