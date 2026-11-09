const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');
const { erro, erroValidacao, erroInterno, sucesso } = require('../utils/respostas');
const {
  validarId, validarNovoUsuario, validarPerfil, validarNovaSenha, validarListagemUsuarios
} = require('../utils/validators');
const usuarioRepo = require('../repositories/usuarioRepository');
const pilotoRepo = require('../repositories/pilotoRepository');
const equipeRepo = require('../repositories/equipeRepository');
const { comTransacao } = require('../repositories/transacao');

// Todas as rotas deste controller exigem perfil ADMIN (ver usuarioRoutes.js).

function usuarioParaResposta(u) {
  return {
    id: u.id,
    nome: u.nome,
    email: u.email,
    perfil: u.perfil,
    criado_em: u.criado_em,
    total_pilotos: Number(u.total_pilotos),
    equipe_criada: u.equipe_criada || null,
    equipe_comandada: u.equipe_comandada || null
  };
}

// GET /api/usuarios?pagina=1&limite=10&busca=ana&perfil=MANAGER
exports.listarUsuarios = async (req, res) => {
  const { valido, erros, dados } = validarListagemUsuarios(req.query);
  if (!valido) return erroValidacao(res, erros);

  try {
    const filtros = { perfil: dados.perfil, busca: dados.busca };
    const total = await usuarioRepo.contar(filtros);
    const totalPaginas = Math.max(1, Math.ceil(total / dados.limite));
    const linhas = await usuarioRepo.listar(filtros, dados.limite, (dados.pagina - 1) * dados.limite);

    return sucesso(res, 200, {
      dados: linhas.map(usuarioParaResposta),
      paginacao: { pagina: dados.pagina, limite: dados.limite, total, total_paginas: totalPaginas }
    });
  } catch (excecao) {
    logger.error('USUARIOS', `Erro ao listar usuários: ${excecao.message}`);
    return erroInterno(res, excecao);
  }
};

// POST /api/usuarios  (o ADMIN escolhe o perfil; MANAGER já nasce com a cópia do catálogo)
exports.criarUsuario = async (req, res) => {
  const { valido, erros, dados } = validarNovoUsuario(req.body);
  if (!valido) return erroValidacao(res, erros, erros[0].mensagem);

  try {
    const existentes = await usuarioRepo.buscarPorEmailOuNome(dados.email, dados.nome);
    if (existentes.length > 0) {
      const nomeEmUso = existentes.some((u) => u.nome.toLowerCase() === dados.nome.toLowerCase());
      return erro(res, 409, nomeEmUso ? 'Este nome de usuário já está em uso.' : 'Este e-mail já está cadastrado.');
    }

    const senhaHash = await bcrypt.hash(dados.senha, 10);
    const novoId = await comTransacao(async (conexao) => {
      const id = await usuarioRepo.inserir({ nome: dados.nome, email: dados.email, senhaHash, perfil: dados.perfil }, conexao);
      if (dados.perfil === 'MANAGER') await pilotoRepo.copiarCatalogoPara(id, conexao);
      return id;
    });

    logger.info('USUARIOS', `Usuário ${dados.email} (ID ${novoId}, perfil ${dados.perfil}) criado pelo ADMIN ID ${req.usuario.id}`);
    const criado = await usuarioRepo.buscarComContagens(novoId);
    return sucesso(res, 201, { mensagem: 'Usuário criado com sucesso.', dados: usuarioParaResposta(criado) });
  } catch (excecao) {
    if (excecao.code === 'ER_DUP_ENTRY') {
      return erro(res, 409, usuarioRepo.campoDuplicado(excecao) === 'nome' ? 'Este nome de usuário já está em uso.' : 'Este e-mail já está cadastrado.');
    }
    logger.error('USUARIOS', `Erro ao criar usuário: ${excecao.message}`);
    return erroInterno(res, excecao, 'Erro ao persistir os dados.');
  }
};

// PUT /api/usuarios/:id/perfil
//  - MANAGER -> ADMIN: os dados pessoais dele (cópia de pilotos, equipe criada e equipe comandada) são apagados
//  - ADMIN -> MANAGER: ele recebe uma cópia nova do catálogo
// O ADMIN não altera o próprio perfil: isso garante que sempre reste ao menos um ADMIN.
exports.alterarPerfil = async (req, res) => {
  const id = validarId(req.params.id);
  if (!id) return erro(res, 400, 'Identificador de usuário inválido.');
  const { valido, erros, dados } = validarPerfil(req.body);
  if (!valido) return erroValidacao(res, erros);

  if (id === req.usuario.id) return erro(res, 409, 'Você não pode alterar o seu próprio perfil.');

  try {
    const alvo = await usuarioRepo.buscarComContagens(id);
    if (!alvo) return erro(res, 404, 'Usuário não encontrado.');

    if (alvo.perfil !== dados.perfil) {
      await comTransacao(async (conexao) => {
        if (dados.perfil === 'ADMIN') {
          await pilotoRepo.excluirTodosDoDono(id, conexao);
          await equipeRepo.excluirDoDono(id, conexao);
          await equipeRepo.deixarDeComandar(id, conexao);
        }
        await usuarioRepo.atualizarPerfil(id, dados.perfil, conexao);
        if (dados.perfil === 'MANAGER') await pilotoRepo.copiarCatalogoPara(id, conexao);
      });
      logger.info('USUARIOS', `Perfil do usuário ID ${id} alterado de ${alvo.perfil} para ${dados.perfil} pelo ADMIN ID ${req.usuario.id}`);
    }

    const atualizado = await usuarioRepo.buscarComContagens(id);
    return sucesso(res, 200, { mensagem: 'Perfil atualizado com sucesso.', dados: usuarioParaResposta(atualizado) });
  } catch (excecao) {
    logger.error('USUARIOS', `Erro ao alterar perfil do usuário ${id}: ${excecao.message}`);
    return erroInterno(res, excecao);
  }
};

// PUT /api/usuarios/:id/senha  (redefinição pelo ADMIN; a senha nunca é registrada em log nem devolvida)
exports.redefinirSenha = async (req, res) => {
  const id = validarId(req.params.id);
  if (!id) return erro(res, 400, 'Identificador de usuário inválido.');
  const { valido, erros, dados } = validarNovaSenha(req.body);
  if (!valido) return erroValidacao(res, erros, erros[0].mensagem);

  try {
    const alvo = await usuarioRepo.buscarComContagens(id);
    if (!alvo) return erro(res, 404, 'Usuário não encontrado.');

    await usuarioRepo.atualizarSenha(id, await bcrypt.hash(dados.senha, 10));
    logger.info('USUARIOS', `Senha do usuário ID ${id} redefinida pelo ADMIN ID ${req.usuario.id}`);
    return sucesso(res, 200, { mensagem: 'Senha redefinida com sucesso.' });
  } catch (excecao) {
    logger.error('USUARIOS', `Erro ao redefinir a senha do usuário ${id}: ${excecao.message}`);
    return erroInterno(res, excecao);
  }
};

// DELETE /api/usuarios/:id  (apaga também os pilotos e a equipe do usuário, por cascata no banco)
exports.excluirUsuario = async (req, res) => {
  const id = validarId(req.params.id);
  if (!id) return erro(res, 400, 'Identificador de usuário inválido.');
  if (id === req.usuario.id) return erro(res, 409, 'Você não pode excluir a sua própria conta.');

  try {
    const alvo = await usuarioRepo.buscarComContagens(id);
    if (!alvo) return erro(res, 404, 'Usuário não encontrado.');

    await usuarioRepo.excluir(id);
    logger.info('USUARIOS', `Usuário ${alvo.email} (ID ${id}) excluído pelo ADMIN ID ${req.usuario.id}`);
    return sucesso(res, 200, {
      mensagem: 'Usuário excluído com sucesso.',
      dados: { pilotos_removidos: Number(alvo.total_pilotos), equipe_removida: alvo.equipe_criada || null }
    });
  } catch (excecao) {
    logger.error('USUARIOS', `Erro ao excluir usuário ${id}: ${excecao.message}`);
    return erroInterno(res, excecao);
  }
};