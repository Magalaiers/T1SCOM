const logger = require('../utils/logger');
const { erro, erroValidacao, erroInterno, sucesso } = require('../utils/respostas');
const {
  ATRIBUTOS, validarId, validarPiloto, mesclarPiloto, resolverEstrelas
} = require('../utils/validators');
const pilotoRepo = require('../repositories/pilotoRepository');
const equipeRepo = require('../repositories/equipeRepository');
const { comTransacao } = require('../repositories/transacao');

// De quem são os dados que esta requisição enxerga e altera:
//  - MANAGER logado -> a cópia pessoal dele (dono = id do usuário)
//  - ADMIN ou visitante -> o catálogo-modelo (dono = null)
const donoDoEscopo = (req) => (req.usuario && req.usuario.perfil === 'MANAGER' ? req.usuario.id : null);

const lerAtributos = (linha) => Object.fromEntries(ATRIBUTOS.map((c) => [c, linha[c]]));

// Linha do banco -> formato devolvido pela API (o mesmo consumido pelo frontend do T1)
function linhaParaResposta(linha) {
  return {
    id: linha.id,
    nome: linha.nome,
    pais: linha.pais,
    idade: linha.idade,
    series_preference: linha.series_preference,
    pay_driver: Boolean(linha.pay_driver),
    marketability: `${linha.marketability}%`,
    status_contrato: linha.status_contrato,
    equipe_id: linha.equipe_id,
    nome_equipe: linha.nome_equipe || null,
    cor_primaria: linha.cor_primaria || null,
    cor_secundaria: linha.cor_secundaria || null,
    salario_anual: Number(linha.salario_anual),
    estrelas_atuais: Number(linha.estrelas_atuais),
    estrelas_potencial: Number(linha.estrelas_potencial),
    overrall: linha.overrall,
    atributos: lerAtributos(linha)
  };
}

// Linha do banco -> objeto de domínio (números/booleanos) usado para mesclar edições
function linhaParaDominio(linha) {
  return {
    nome: linha.nome,
    pais: linha.pais,
    idade: linha.idade,
    salario_anual: Number(linha.salario_anual),
    series_preference: linha.series_preference,
    pay_driver: Boolean(linha.pay_driver),
    marketability: linha.marketability,
    status_contrato: linha.status_contrato,
    equipe_id: linha.equipe_id,
    estrelas_atuais: Number(linha.estrelas_atuais),
    estrelas_potencial: Number(linha.estrelas_potencial),
    atributos: lerAtributos(linha)
  };
}

// GET /api/pilotos
exports.listarPilotos = async (req, res) => {
  try {
    const linhas = await pilotoRepo.listar(donoDoEscopo(req));
    return sucesso(res, 200, { dados: linhas.map(linhaParaResposta) });
  } catch (excecao) {
    logger.error('PILOTOS', `Erro ao listar pilotos: ${excecao.message}`);
    return erroInterno(res, excecao);
  }
};

// GET /api/pilotos/:id
exports.obterPiloto = async (req, res) => {
  const id = validarId(req.params.id);
  if (!id) return erro(res, 400, 'Identificador de piloto inválido.');

  try {
    const linha = await pilotoRepo.buscarPorId(id, donoDoEscopo(req));
    if (!linha) return erro(res, 404, 'Piloto não encontrado.');
    return sucesso(res, 200, { dados: linhaParaResposta(linha) });
  } catch (excecao) {
    logger.error('PILOTOS', `Erro ao buscar piloto ${id}: ${excecao.message}`);
    return erroInterno(res, excecao);
  }
};

// POST /api/pilotos
exports.criarPiloto = async (req, res) => {
  const { valido, erros, dados } = validarPiloto(req.body);
  if (!valido) return erroValidacao(res, erros);

  try {
    if (dados.equipe_id !== null && !(await equipeRepo.existe(dados.equipe_id))) {
      return erroValidacao(res, [{ campo: 'equipe_id', mensagem: 'A equipe informada não existe.' }]);
    }

    const donoId = donoDoEscopo(req);
    const estrelas = resolverEstrelas(dados, null);
    const novoId = await pilotoRepo.inserir(dados, estrelas, donoId);

    logger.info('PILOTOS', `Piloto criado: ID ${novoId} por usuário ID ${req.usuario.id}`);
    const criado = await pilotoRepo.buscarPorId(novoId, donoId);
    return sucesso(res, 201, { mensagem: 'Piloto criado com sucesso.', dados: linhaParaResposta(criado) });
  } catch (excecao) {
    logger.error('PILOTOS', `Erro ao criar piloto: ${excecao.message}`);
    return erroInterno(res, excecao, 'Erro ao persistir os dados.');
  }
};

// PUT /api/pilotos/:id  (campos omitidos mantêm o valor atual)
exports.atualizarPiloto = async (req, res) => {
  const id = validarId(req.params.id);
  if (!id) return erro(res, 400, 'Identificador de piloto inválido.');

  try {
    const donoId = donoDoEscopo(req);
    const linha = await pilotoRepo.buscarPorId(id, donoId);
    if (!linha) return erro(res, 404, 'Piloto não encontrado.');

    const existente = linhaParaDominio(linha);
    const { valido, erros, dados } = validarPiloto(mesclarPiloto(existente, req.body));
    if (!valido) return erroValidacao(res, erros);

    if (dados.equipe_id !== null && !(await equipeRepo.existe(dados.equipe_id))) {
      return erroValidacao(res, [{ campo: 'equipe_id', mensagem: 'A equipe informada não existe.' }]);
    }

    const estrelas = resolverEstrelas(dados, existente);
    const gravado = await pilotoRepo.atualizar(id, donoId, dados, estrelas);
    if (!gravado) return erro(res, 404, 'Piloto não encontrado.');

    logger.info('PILOTOS', `Piloto ID ${id} atualizado por usuário ID ${req.usuario.id}`);
    const atualizado = await pilotoRepo.buscarPorId(id, donoId);
    return sucesso(res, 200, { mensagem: 'Piloto atualizado com sucesso.', dados: linhaParaResposta(atualizado) });
  } catch (excecao) {
    logger.error('PILOTOS', `Erro ao atualizar piloto ${id}: ${excecao.message}`);
    return erroInterno(res, excecao);
  }
};

// DELETE /api/pilotos/:id
exports.deletarPiloto = async (req, res) => {
  const id = validarId(req.params.id);
  if (!id) return erro(res, 400, 'Identificador de piloto inválido.');

  try {
    const removido = await pilotoRepo.excluir(id, donoDoEscopo(req));
    if (!removido) return erro(res, 404, 'Piloto não encontrado.');

    logger.info('PILOTOS', `Piloto ID ${id} removido por usuário ID ${req.usuario.id}`);
    return sucesso(res, 200, { mensagem: 'Registro do piloto removido definitivamente.' });
  } catch (excecao) {
    logger.error('PILOTOS', `Erro ao deletar piloto ${id}: ${excecao.message}`);
    return erroInterno(res, excecao);
  }
};

// POST /api/pilotos/restaurar  (só MANAGER)
// Apaga a cópia pessoal do usuário e recebe uma nova do catálogo-modelo, de forma atômica.
exports.restaurarPilotos = async (req, res) => {
  const donoId = req.usuario.id;
  try {
    const total = await comTransacao(async (conexao) => {
      await pilotoRepo.excluirTodosDoDono(donoId, conexao);
      return pilotoRepo.copiarCatalogoPara(donoId, conexao);
    });

    logger.info('PILOTOS', `Dados restaurados para o usuário ID ${donoId}: ${total} pilotos copiados do catálogo`);
    return sucesso(res, 200, { mensagem: 'Seus pilotos foram restaurados a partir do catálogo-modelo.', dados: { total } });
  } catch (excecao) {
    logger.error('PILOTOS', `Erro ao restaurar dados do usuário ${donoId}: ${excecao.message}`);
    return erroInterno(res, excecao, 'Erro ao restaurar os dados.');
  }
};