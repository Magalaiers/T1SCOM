// Respostas HTTP padronizadas: { status, mensagem, ... }
// Detalhes técnicos (erro.message) só são expostos com NODE_ENV=development.

function erro(res, codigo, mensagem, extras = {}) {
  return res.status(codigo).json({ status: 'erro', mensagem, ...extras });
}

function erroValidacao(res, erros, mensagem = 'Dados inválidos. Corrija os campos indicados.') {
  return erro(res, 400, mensagem, { erros });
}

function erroInterno(res, excecao, mensagem = 'Erro interno no servidor.') {
  const extras = process.env.NODE_ENV === 'development' ? { detalhe: excecao.message } : {};
  return erro(res, 500, mensagem, extras);
}

function sucesso(res, codigo, corpo = {}) {
  return res.status(codigo).json({ status: 'sucesso', ...corpo });
}

module.exports = { erro, erroValidacao, erroInterno, sucesso };
