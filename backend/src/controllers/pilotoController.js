const db = require('../config/db');
const logger = require('../utils/logger');
const { erro, erroValidacao, erroInterno, sucesso } = require('../utils/respostas');
const {
  ATRIBUTOS, validarId, validarPiloto, mesclarPiloto, resolverEstrelas
} = require('../utils/validators');

const SELECT_PILOTO = `
  SELECT p.*, e.nome AS nome_equipe, e.cor_primaria, e.cor_secundaria
  FROM pilotos p
  LEFT JOIN equipes e ON e.id = p.equipe_id
`;

const COLUNAS_ESCRITA = [
  'nome', 'pais', 'idade', 'salario_anual', 'series_preference', 'pay_driver',
  'marketability', 'status_contrato', 'equipe_id', ...ATRIBUTOS,
  'estrelas_atuais', 'estrelas_potencial'
];

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

const valoresParaGravar = (dados, estrelas) => {
  const completo = { ...dados, ...estrelas, ...dados.atributos, pay_driver: dados.pay_driver ? 1 : 0 };
  return COLUNAS_ESCRITA.map((coluna) => completo[coluna]);
};

async function buscarPorId(id) {
  const [linhas] = await db.execute(`${SELECT_PILOTO} WHERE p.id = ?`, [id]);
  return linhas[0] || null;
}

async function equipeExiste(id) {
  const [linhas] = await db.execute('SELECT id FROM equipes WHERE id = ?', [id]);
  return linhas.length > 0;
}

// GET /api/pilotos
exports.listarPilotos = async (req, res) => {
  try {
    const [linhas] = await db.query(`${SELECT_PILOTO} ORDER BY p.nome ASC`);
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
    const linha = await buscarPorId(id);
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
    if (dados.equipe_id !== null && !(await equipeExiste(dados.equipe_id))) {
      return erroValidacao(res, [{ campo: 'equipe_id', mensagem: 'A equipe informada não existe.' }]);
    }

    const estrelas = resolverEstrelas(dados, null);
    const marcadores = COLUNAS_ESCRITA.map(() => '?').join(', ');
    const [resultado] = await db.execute(
      `INSERT INTO pilotos (${COLUNAS_ESCRITA.join(', ')}) VALUES (${marcadores})`,
      valoresParaGravar(dados, estrelas)
    );

    logger.info('PILOTOS', `Piloto criado: ID ${resultado.insertId} por usuário ID ${req.usuario.id}`);
    const criado = await buscarPorId(resultado.insertId);
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
    const linha = await buscarPorId(id);
    if (!linha) return erro(res, 404, 'Piloto não encontrado.');

    const existente = linhaParaDominio(linha);
    const { valido, erros, dados } = validarPiloto(mesclarPiloto(existente, req.body));
    if (!valido) return erroValidacao(res, erros);

    if (dados.equipe_id !== null && !(await equipeExiste(dados.equipe_id))) {
      return erroValidacao(res, [{ campo: 'equipe_id', mensagem: 'A equipe informada não existe.' }]);
    }

    const estrelas = resolverEstrelas(dados, existente);
    const atribuicoes = COLUNAS_ESCRITA.map((coluna) => `${coluna} = ?`).join(', ');
    await db.execute(
      `UPDATE pilotos SET ${atribuicoes} WHERE id = ?`,
      [...valoresParaGravar(dados, estrelas), id]
    );

    logger.info('PILOTOS', `Piloto ID ${id} atualizado por usuário ID ${req.usuario.id}`);
    const atualizado = await buscarPorId(id);
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
    const [resultado] = await db.execute('DELETE FROM pilotos WHERE id = ?', [id]);
    if (resultado.affectedRows === 0) return erro(res, 404, 'Piloto não encontrado.');

    logger.info('PILOTOS', `Piloto ID ${id} removido por usuário ID ${req.usuario.id}`);
    return sucesso(res, 200, { mensagem: 'Registro do piloto removido definitivamente.' });
  } catch (excecao) {
    logger.error('PILOTOS', `Erro ao deletar piloto ${id}: ${excecao.message}`);
    return erroInterno(res, excecao);
  }
};
