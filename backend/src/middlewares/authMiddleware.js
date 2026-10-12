const jwt = require('jsonwebtoken');

// 1. Valida se o usuário enviou um token JWT válido
function autenticarToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  // Formato esperado: "Bearer <token>"
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      status: 'erro',
      mensagem: 'Acesso negado. Token de autenticação não fornecido.'
    });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'chave_padrao_scom_t2');
    req.usuario = payload; // Disponibiliza { id, email, perfil } para as rotas seguintes
    next();
  } catch (err) {
    return res.status(401).json({
      status: 'erro',
      mensagem: 'Token inválido ou expirado.'
    });
  }
}

// 2. Middleware de RBAC (Controle de Acesso Baseado em Perfis)
function autorizarPerfis(...perfisPermitidos) {
  return (req, res, next) => {
    if (!req.usuario || !perfisPermitidos.includes(req.usuario.perfil)) {
      return res.status(403).json({
        status: 'erro',
        mensagem: 'Acesso proibido. Seu perfil não possui permissão para esta operação.'
      });
    }
    next();
  };
}

module.exports = { autenticarToken, autorizarPerfis };