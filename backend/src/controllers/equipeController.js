const db = require('../config/db');
const logger = require('../utils/logger');
const { erroInterno, sucesso } = require('../utils/respostas');

// GET /api/equipes
exports.listarEquipes = async (req, res) => {
  try {
    const [equipes] = await db.query(`
      SELECT e.id, e.nome, e.pais, e.campeonato_id, c.nome AS nome_campeonato,
             e.cor_primaria, e.cor_secundaria
      FROM equipes e
      JOIN campeonatos c ON c.id = e.campeonato_id
      ORDER BY e.nome ASC
    `);
    return sucesso(res, 200, { dados: equipes });
  } catch (excecao) {
    logger.error('EQUIPES', `Erro ao listar equipes: ${excecao.message}`);
    return erroInterno(res, excecao);
  }
};
