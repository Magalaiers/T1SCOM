const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/jwt');
const logger = require('../utils/logger');
const { erro, erroInterno } = require('../utils/respostas');
const usuarioRepo = require('../repositories/usuarioRepository');
const tokenRepo = require('../repositories/tokenRepository');

const contexto = (req) => `${req.method} ${req.originalUrl} ip=${req.ip}`;

// Exige "Authorization: Bearer <token>" válido, não expirado e não revogado pelo logout.
// Depois de validar o token, confirma NO BANCO que o usuário ainda existe e usa o perfil atual dele
// (o perfil escrito dentro do token não é confiável: pode estar desatualizado).
// Deixa em req.token o identificador (jti) e a expiração (exp) do token usado: o logout precisa deles.
function autenticarToken(req, res, next) {
  const cabecalho = req.headers.authorization;
  const partes = typeof cabecalho === 'string' ? cabecalho.match(/^Bearer\s+(\S+)$/i) : null;

  if (!partes) {
    logger.warn('AUTH', `Acesso negado (token ausente ou mal formado): ${contexto(req)}`);
    return erro(res, 401, 'Token de autenticação não fornecido.');
  }

  jwt.verify(partes[1], JWT_SECRET, { algorithms: ['HS256'] }, async (falha, payload) => {
    if (falha) {
      logger.warn('AUTH', `Acesso negado (token inválido: ${falha.name}): ${contexto(req)}`);
      return erro(res, 401, 'Token inválido ou expirado.');
    }

    // Todo token emitido pelo login tem jti e exp. Sem eles não dá para revogar: é recusado.
    if (typeof payload.jti !== 'string' || !Number.isInteger(payload.exp)) {
      logger.warn('AUTH', `Acesso negado (token sem identificador jti/exp): ${contexto(req)}`);
      return erro(res, 401, 'Token inválido ou expirado.');
    }

    try {
      if (await tokenRepo.estaRevogado(payload.jti)) {
        logger.warn('AUTH', `Acesso negado (token revogado pelo logout, usuário ID ${payload.id}): ${contexto(req)}`);
        return erro(res, 401, 'Sessão encerrada. Faça login novamente.');
      }

      const usuario = Number.isInteger(payload.id) ? await usuarioRepo.buscarPorId(payload.id) : null;
      if (!usuario) {
        logger.warn('AUTH', `Acesso negado (usuário do token não existe mais, ID ${payload.id}): ${contexto(req)}`);
        return erro(res, 401, 'Sessão inválida: o usuário não existe mais. Faça login novamente.');
      }
      req.usuario = { id: usuario.id, nome: usuario.nome, email: usuario.email, perfil: usuario.perfil };
      req.token = { jti: payload.jti, exp: payload.exp };
      return next();
    } catch (excecao) {
      logger.error('AUTH', `Erro ao validar o usuário do token: ${excecao.message}`);
      return erroInterno(res, excecao);
    }
  });
}

// Para rotas públicas que mudam de comportamento quando há login (ex.: listar pilotos).
// Sem cabeçalho Authorization = visitante. Com cabeçalho, ele precisa ser válido (senão 401).
function autenticacaoOpcional(req, res, next) {
  if (!req.headers.authorization) return next();
  return autenticarToken(req, res, next);
}

// Autorização por perfil (RBAC). Aceita autorizarPerfis('ADMIN', 'MANAGER') ou autorizarPerfis(['ADMIN', 'MANAGER']).
function autorizarPerfis(...perfisPermitidos) {
  const permitidos = perfisPermitidos.flat().map((p) => String(p).toUpperCase().trim());

  return (req, res, next) => {
    const usuario = req.usuario || {};
    const perfil = String(usuario.perfil || '').toUpperCase().trim();

    if (!perfil || !permitidos.includes(perfil)) {
      logger.warn('AUTH', `Acesso proibido: usuário ID ${usuario.id} (perfil ${perfil || 'nenhum'}) em ${contexto(req)}`);
      return erro(res, 403, 'Acesso proibido. Seu perfil não possui permissão para esta operação.');
    }
    next();
  };
}

module.exports = { autenticarToken, autenticacaoOpcional, autorizarPerfis };