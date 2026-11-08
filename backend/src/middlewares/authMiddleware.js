const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/jwt');
const logger = require('../utils/logger');
const { erro } = require('../utils/respostas');

const contexto = (req) => `${req.method} ${req.originalUrl} ip=${req.ip}`;

// Exige "Authorization: Bearer <token>" válido e não expirado.
function autenticarToken(req, res, next) {
  const cabecalho = req.headers.authorization;
  const partes = typeof cabecalho === 'string' ? cabecalho.match(/^Bearer\s+(\S+)$/i) : null;

  if (!partes) {
    logger.warn('AUTH', `Acesso negado (token ausente ou mal formado): ${contexto(req)}`);
    return erro(res, 401, 'Token de autenticação não fornecido.');
  }

  jwt.verify(partes[1], JWT_SECRET, { algorithms: ['HS256'] }, (falha, payload) => {
    if (falha) {
      logger.warn('AUTH', `Acesso negado (token inválido: ${falha.name}): ${contexto(req)}`);
      return erro(res, 401, 'Token inválido ou expirado.');
    }
    req.usuario = payload;
    next();
  });
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

module.exports = { autenticarToken, autorizarPerfis };