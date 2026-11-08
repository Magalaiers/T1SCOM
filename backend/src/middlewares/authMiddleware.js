const jwt = require('jsonwebtoken');

// Ensure the JWT_SECRET matches exactly what you use in authController.js
const JWT_SECRET = process.env.JWT_SECRET || 'chave_mestra_motorsport_2026';

function autenticarToken(req, res, next) {
  let authHeader = req.headers['authorization'];

  if (!authHeader) {
    return res.status(401).json({
      status: 'erro',
      mensagem: 'Token de autenticação não fornecido.'
    });
  }

  // Handle potential duplicate headers from Postman
  if (Array.isArray(authHeader)) authHeader = authHeader[0];
  if (authHeader.includes(',')) authHeader = authHeader.split(',')[0].trim();

  // Strip 'Bearer' to isolate the token
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return res.status(401).json({
      status: 'erro',
      mensagem: 'Token de autenticação não fornecido.'
    });
  }

  jwt.verify(token, JWT_SECRET, (erro, decodificado) => {
    if (erro) {
      console.log('[DEBUG AUTH 401] Falha na validação do token JWT:', erro.message);
      return res.status(401).json({
        status: 'erro',
        mensagem: 'Token inválido ou expirado.'
      });
    }

    // CRITICAL FIX: Save the decoded token payload to both properties
    // to prevent undefined errors in the authorization middleware.
    req.usuario = decodificado;
    req.user = decodificado;
    next();
  });
}

function autorizarPerfis(...perfisPermitidos) {
  return (req, res, next) => {
    // Check both potential properties where the payload might reside
    const dadosUsuario = req.usuario || req.user || {};
    
    // Normalize the user's role and the allowed roles to uppercase
    const perfilUsuario = String(dadosUsuario.perfil || dadosUsuario.role || '').toUpperCase().trim();
    const permitidos = perfisPermitidos.flat().map(p => String(p).toUpperCase().trim());

    console.log(`[RBAC] User (${perfilUsuario}) attempting access. Allowed roles: [${permitidos.join(', ')}]`);

    if (!perfilUsuario || !permitidos.includes(perfilUsuario)) {
      return res.status(403).json({
        status: 'erro',
        mensagem: 'Acesso proibido. Seu perfil não possui permissão para esta operação.'
      });
    }

    next();
  };
}

module.exports = {
  autenticarToken,
  autorizarPerfis
};