const logger = require('../utils/logger');
const { erroInterno, sucesso } = require('../utils/respostas');
const equipeRepo = require('../repositories/equipeRepository');

// GET /api/equipes
exports.listarEquipes = async (req, res) => {
  try {
    const equipes = await equipeRepo.listarComCampeonato();
    return sucesso(res, 200, { dados: equipes });
  } catch (excecao) {
    logger.error('EQUIPES', `Erro ao listar equipes: ${excecao.message}`);
    return erroInterno(res, excecao);
  }
};