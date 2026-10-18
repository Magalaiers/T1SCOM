const jwt = require('jsonwebtoken');

// A mesma chave exata do authController
const JWT_SECRET = process.env.JWT_SECRET || 'chave_mestra_motorsport_2026';

function autenticarToken(req, res, next) {
  let authHeader = req.headers['authorization'];

  if (!authHeader) {
    return res.status(401).json({
      status: 'erro',
      mensagem: 'Token de autenticação não fornecido.'
    });
  }

  // Trata conflito caso o Postman envie cabeçalhos duplicados
  if (Array.isArray(authHeader)) authHeader = authHeader[0];
  if (authHeader.includes(',')) authHeader = authHeader.split(',')[0].trim();

  // Remove qualquer repetição da palavra "Bearer" e espaços extras
  const token = authHeader.replace(/^Bearer\s+/i, '').replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return res.status(401).json({
      status: 'erro',
      mensagem: 'Token de autenticação não fornecido.'
    });
  }

  jwt.verify(token, JWT_SECRET, (erro, decodificado) => {
    if (erro) {
      console.log('--------------------------------------------------');
      console.log('[DEBUG AUTH 401] Falha na validação do token JWT:');
      console.log('Motivo exato:', erro.message);
      console.log('Início do token recebido:', token.slice(0, 30) + '...');
      console.log('Chave utilizada:', JWT_SECRET);
      console.log('--------------------------------------------------');

      return res.status(401).json({
        status: 'erro',
        mensagem: 'Token inválido ou expirado.'
      });
    }

    req.usuario = decodificado;
    req.user = decodificado;
    next();
  });
}

function autorizarPerfis(...perfisPermitidos) {
  return (req, res, next) => {
    const dadosUsuario = req.usuario || req.user || {};
    const perfilUsuario = String(dadosUsuario.perfil || dadosUsuario.role || '').toUpperCase().trim();
    const permitidos = perfisPermitidos.flat().map(p => String(p).toUpperCase().trim());

    console.log(`[RBAC] Usuário ID ${dadosUsuario.id} (${perfilUsuario}) acessando rota restrita a: [${permitidos.join(', ')}]`);

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