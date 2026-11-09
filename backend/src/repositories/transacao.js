// Executa um bloco de trabalho dentro de uma transação: ou tudo é gravado, ou nada.
// Uso: await comTransacao(async (conexao) => { ... repositorio.metodo(..., conexao) ... });
const db = require('../config/db');

async function comTransacao(trabalho) {
  const conexao = await db.getConnection();
  try {
    await conexao.beginTransaction();
    const resultado = await trabalho(conexao);
    await conexao.commit();
    return resultado;
  } catch (excecao) {
    await conexao.rollback();
    throw excecao;
  } finally {
    conexao.release();
  }
}

module.exports = { comTransacao };