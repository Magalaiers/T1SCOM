const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const logger = require('../utils/logger');

// POST /api/auth/login
exports.login = async (req, res) => {
  const { email, senha } = req.body;

  if (!email || !senha) {
    return res.status(400).json({
      status: 'erro',
      mensagem: 'E-mail e senha são obrigatórios.'
    });
  }

  try {
    // Consulta parametrizada (Prepared Statement) contra SQL Injection
    const [usuarios] = await db.query(
      'SELECT id, nome, email, senha_hash, perfil FROM usuarios WHERE email = ?',
      [email]
    );

    if (usuarios.length === 0) {
      logger.warn('AUTH', `Falha de login: e-mail não encontrado (${email})`);
      return res.status(401).json({ status: 'erro', mensagem: 'Credenciais inválidas.' });
    }

    const usuario = usuarios[0];

    // Validação de senha com hash seguro bcrypt
    const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);
    if (!senhaValida) {
      logger.warn('AUTH', `Falha de login: senha incorreta para ${email}`);
      return res.status(401).json({ status: 'erro', mensagem: 'Credenciais inválidas.' });
    }

    // Assinatura do Token JWT
    const payload = {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      perfil: usuario.perfil
    };

    const token = jwt.sign(
      payload,
      process.env.JWT_SECRET || 'chave_padrao_scom_t2',
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    logger.info('AUTH', `Login com sucesso para ID ${usuario.id} (${usuario.email}) - Perfil: ${usuario.perfil}`);

    return res.status(200).json({
      status: 'sucesso',
      mensagem: 'Login realizado com sucesso',
      token,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        perfil: usuario.perfil
      }
    });
  } catch (error) {
    logger.error('AUTH', `Erro interno 500 no login: ${error.message}`);
    return res.status(500).json({
      status: 'erro',
      mensagem: 'Erro interno ao processar autenticação.'
    });
  }
};

// POST /api/auth/logout
exports.logout = (req, res) => {
  // Em arquitetura baseada em JWT sem estado, o logout operacionaliza-se
  // no cliente ao descartar o token, retornando status 200 informativo
  return res.status(200).json({
    status: 'sucesso',
    mensagem: 'Logout realizado com sucesso. Descarte o token no cliente.'
  });
};

// GET /api/auth/perfil (Rota protegida de teste)
exports.obterPerfilLogado = (req, res) => {
  return res.status(200).json({
    status: 'sucesso',
    usuario: req.usuario
  });
};