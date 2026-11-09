const logger = require('../utils/logger');
const { erro, erroValidacao, erroInterno, sucesso } = require('../utils/respostas');
const { validarEquipe, mesclarEquipe } = require('../utils/validators');
const { donoDoEscopo } = require('../utils/escopo');
const equipeRepo = require('../repositories/equipeRepository');
const campeonatoRepo = require('../repositories/campeonatoRepository');
const pilotoRepo = require('../repositories/pilotoRepository');
const { comTransacao } = require('../repositories/transacao');

const MSG_JA_COMANDA = 'Você já comanda uma equipe. Deixe a atual antes de assumir ou criar outra.';
const MSG_NOME_OFICIAL = 'Já existe uma equipe oficial com esse nome. Escolha outro nome.';
const MSG_OFICIAL_SOMENTE_LEITURA = 'Equipes oficiais são compartilhadas e não podem ser editadas. Você pode contratar e dispensar pilotos.';

function equipeParaResposta(equipe) {
  return {
    id: equipe.id,
    nome: equipe.nome,
    pais: equipe.pais,
    campeonato_id: equipe.campeonato_id,
    nome_campeonato: equipe.nome_campeonato,
    tipo_campeonato: equipe.tipo_campeonato,
    cor_primaria: equipe.cor_primaria,
    cor_secundaria: equipe.cor_secundaria,
    elenco_maximo: equipe.elenco_maximo,
    propria: Boolean(equipe.propria)
  };
}

// Na rota "minha equipe" a resposta diz também se é oficial ou criada pelo usuário
const comTipo = (equipe) => ({ ...equipeParaResposta(equipe), tipo: equipe.propria ? 'criada' : 'oficial' });

const erroCampeonato = (res) => erroValidacao(res, [{ campo: 'campeonato_id', mensagem: 'O campeonato informado não existe.' }]);

// GET /api/equipes  (visitante e ADMIN: só as oficiais; MANAGER: oficiais + a criada por ele, que vem primeiro)
exports.listarEquipes = async (req, res) => {
  try {
    const equipes = await equipeRepo.listarVisiveis(donoDoEscopo(req));
    return sucesso(res, 200, { dados: equipes.map(equipeParaResposta) });
  } catch (excecao) {
    logger.error('EQUIPES', `Erro ao listar equipes: ${excecao.message}`);
    return erroInterno(res, excecao);
  }
};

// GET /api/equipes/minha  (só MANAGER): a equipe que ele comanda + resumo calculado pelo banco + elenco
exports.obterMinhaEquipe = async (req, res) => {
  const donoId = req.usuario.id;
  try {
    const equipe = await equipeRepo.buscarComandada(donoId);
    if (!equipe) return erro(res, 404, 'Você ainda não comanda nenhuma equipe.');

    const [resumo, elenco] = await Promise.all([
      equipeRepo.resumo(equipe.id, donoId),
      equipeRepo.listarElenco(equipe.id, donoId)
    ]);
    return sucesso(res, 200, { dados: { equipe: comTipo(equipe), resumo, elenco } });
  } catch (excecao) {
    logger.error('EQUIPES', `Erro ao obter a equipe do usuário ${donoId}: ${excecao.message}`);
    return erroInterno(res, excecao);
  }
};

// POST /api/equipes/minha/assumir  (só MANAGER): passa a comandar uma equipe OFICIAL
// Nada da equipe oficial é alterado: o elenco vive na cópia de pilotos do próprio usuário.
exports.assumirEquipe = async (req, res) => {
  const donoId = req.usuario.id;
  const equipeId = req.body && req.body.equipe_id;
  if (!Number.isInteger(equipeId) || equipeId < 1) {
    return erroValidacao(res, [{ campo: 'equipe_id', mensagem: 'Informe o identificador da equipe (inteiro positivo).' }]);
  }

  try {
    if (await equipeRepo.buscarComandada(donoId)) return erro(res, 409, MSG_JA_COMANDA);

    const equipe = await equipeRepo.buscarVisivel(equipeId, null); // null = só equipes oficiais
    if (!equipe) return erro(res, 404, 'Equipe não encontrada.');

    await equipeRepo.comandar(donoId, equipe.id);
    logger.info('EQUIPES', `Usuário ID ${donoId} passou a comandar a equipe oficial ID ${equipe.id} (${equipe.nome})`);
    return sucesso(res, 201, { mensagem: `Você agora comanda ${equipe.nome}.`, dados: comTipo(equipe) });
  } catch (excecao) {
    if (excecao.code === 'ER_DUP_ENTRY') return erro(res, 409, MSG_JA_COMANDA); // corrida entre duas requisições
    logger.error('EQUIPES', `Erro ao assumir equipe (usuário ${donoId}): ${excecao.message}`);
    return erroInterno(res, excecao);
  }
};

// POST /api/equipes/minha  (só MANAGER): cria uma equipe nova e já passa a comandá-la
exports.criarMinhaEquipe = async (req, res) => {
  const { valido, erros, dados } = validarEquipe(req.body);
  if (!valido) return erroValidacao(res, erros);

  const donoId = req.usuario.id;
  try {
    if (await equipeRepo.buscarComandada(donoId)) return erro(res, 409, MSG_JA_COMANDA);
    if (!(await campeonatoRepo.buscarPorId(dados.campeonato_id))) return erroCampeonato(res);
    if (await equipeRepo.nomeOficialExiste(dados.nome)) return erro(res, 409, MSG_NOME_OFICIAL);

    await comTransacao(async (conexao) => {
      const novaId = await equipeRepo.inserir(dados, donoId, conexao);
      await equipeRepo.comandar(donoId, novaId, conexao);
    });
    logger.info('EQUIPES', `Equipe criada por usuário ID ${donoId}: "${dados.nome}"`);

    const criada = await equipeRepo.buscarComandada(donoId);
    return sucesso(res, 201, { mensagem: 'Equipe criada com sucesso.', dados: comTipo(criada) });
  } catch (excecao) {
    if (excecao.code === 'ER_DUP_ENTRY') return erro(res, 409, MSG_JA_COMANDA);
    logger.error('EQUIPES', `Erro ao criar equipe do usuário ${donoId}: ${excecao.message}`);
    return erroInterno(res, excecao, 'Erro ao persistir os dados.');
  }
};

// PUT /api/equipes/minha  (só MANAGER; só equipe CRIADA; campos omitidos mantêm o valor atual)
exports.atualizarMinhaEquipe = async (req, res) => {
  const donoId = req.usuario.id;
  try {
    const atual = await equipeRepo.buscarComandada(donoId);
    if (!atual) return erro(res, 404, 'Você ainda não comanda nenhuma equipe.');
    if (!atual.propria) return erro(res, 403, MSG_OFICIAL_SOMENTE_LEITURA);

    const existente = {
      nome: atual.nome, pais: atual.pais, campeonato_id: atual.campeonato_id,
      cor_primaria: atual.cor_primaria, cor_secundaria: atual.cor_secundaria
    };
    const { valido, erros, dados } = validarEquipe(mesclarEquipe(existente, req.body));
    if (!valido) return erroValidacao(res, erros);

    const campeonato = await campeonatoRepo.buscarPorId(dados.campeonato_id);
    if (!campeonato) return erroCampeonato(res);
    if (await equipeRepo.nomeOficialExiste(dados.nome)) return erro(res, 409, MSG_NOME_OFICIAL);

    // Mudar de campeonato muda o limite do elenco: não pode ficar com mais pilotos do que o novo limite
    const { total_pilotos: total } = await equipeRepo.resumo(atual.id, donoId);
    if (total > campeonato.elenco_maximo) {
      return erroValidacao(res, [{
        campo: 'campeonato_id',
        mensagem: `Esse campeonato permite até ${campeonato.elenco_maximo} pilotos e a sua equipe tem ${total}. Dispense pilotos antes de mudar.`
      }]);
    }

    await equipeRepo.atualizar(donoId, dados);
    logger.info('EQUIPES', `Equipe atualizada por usuário ID ${donoId}`);

    const atualizada = await equipeRepo.buscarComandada(donoId);
    return sucesso(res, 200, { mensagem: 'Equipe atualizada com sucesso.', dados: comTipo(atualizada) });
  } catch (excecao) {
    logger.error('EQUIPES', `Erro ao atualizar equipe do usuário ${donoId}: ${excecao.message}`);
    return erroInterno(res, excecao);
  }
};

// DELETE /api/equipes/minha  (só MANAGER): deixa a equipe que comanda
//  - oficial: só deixa de comandá-la (o elenco continua como está)
//  - criada:  a equipe é excluída e os pilotos dela voltam a ser agentes livres
exports.deixarEquipe = async (req, res) => {
  const donoId = req.usuario.id;
  try {
    const equipe = await equipeRepo.buscarComandada(donoId);
    if (!equipe) return erro(res, 404, 'Você ainda não comanda nenhuma equipe.');

    if (!equipe.propria) {
      await equipeRepo.deixarDeComandar(donoId);
      logger.info('EQUIPES', `Usuário ID ${donoId} deixou a equipe oficial ID ${equipe.id}`);
      return sucesso(res, 200, { mensagem: `Você deixou de comandar ${equipe.nome}.`, dados: { tipo: 'oficial', pilotos_liberados: 0 } });
    }

    const liberados = await comTransacao(async (conexao) => {
      const total = await pilotoRepo.liberarDaEquipe(equipe.id, donoId, conexao);
      await equipeRepo.excluirDoDono(donoId, conexao);
      return total;
    });
    logger.info('EQUIPES', `Equipe criada por usuário ID ${donoId} foi excluída (${liberados} pilotos liberados)`);
    return sucesso(res, 200, {
      mensagem: 'Equipe excluída. Os pilotos dela voltaram a ser agentes livres.',
      dados: { tipo: 'criada', pilotos_liberados: liberados }
    });
  } catch (excecao) {
    logger.error('EQUIPES', `Erro ao deixar a equipe (usuário ${donoId}): ${excecao.message}`);
    return erroInterno(res, excecao);
  }
};