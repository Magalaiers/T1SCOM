const logger = require('../utils/logger');
const { erroInterno, sucesso } = require('../utils/respostas');
const campeonatoRepo = require('../repositories/campeonatoRepository');

// GET /api/campeonatos
exports.listarCampeonatos = async (req, res) => {
  try {
    const campeonatos = await campeonatoRepo.listar();
    return sucesso(res, 200, { dados: campeonatos });
  } catch (excecao) {
    logger.error('CAMPEONATOS', `Erro ao listar campeonatos: ${excecao.message}`);
    return erroInterno(res, excecao);
  }
};