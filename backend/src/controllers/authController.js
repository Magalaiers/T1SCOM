const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const logger = require('../utils/logger');

// Mesma chave de contingência do authMiddleware.js
const JWT_SECRET = process.env.JWT_SECRET || 'chave_mestra_motorsport_2026';

// 1. POST /api/auth/login
exports.login = async (req, res) => {
  const { email, senha } = req.body;

  if (!email || !senha) {
    return res.status(400).json({
      status: 'erro',
      mensagem: 'Forneça o e-mail e a senha para autenticar.'
    });
  }

  try {
    // Busca flexível com SELECT * para aceitar tanto senha_hash quanto senha
    const [usuarios] = await db.query(
      'SELECT * FROM usuarios WHERE email = ?',
      [email.trim().toLowerCase()]
    );

    if (usuarios.length === 0) {
      logger.warn('AUTH', `Falha de autenticação: e-mail não encontrado (${email})`);
      return res.status(401).json({
        status: 'erro',
        mensagem: 'Credenciais inválidas.'
      });
    }

    const usuario = usuarios[0];
    
    // Identifica o campo de senha da tabela (seja senha_hash ou senha)
    const hashBanco = usuario.senha_hash || usuario.senha || '';

    // Validação de senha segura com suporte a bcrypt
    let senhaCorreta = false;
    try {
      senhaCorreta = await bcrypt.compare(senha, hashBanco);
    } catch (e) {
      senhaCorreta = false;
    }

    // Suporte para senhas inseridas em texto plano durante o seed inicial
    if (!senhaCorreta && (senha === hashBanco || senha === usuario.senha)) {
      senhaCorreta = true;
    }

    if (!senhaCorreta) {
      logger.warn('AUTH', `Falha de autenticação: senha incorreta para o e-mail: ${email}`);
      return res.status(401).json({
        status: 'erro',
        mensagem: 'Credenciais inválidas.'
      });
    }

    // Normalização do perfil em maiúsculas (ADMIN / MANAGER)
    const perfilFormatado = String(usuario.perfil || 'ADMIN').toUpperCase().trim();

    // Payload estruturado para o controle RBAC
    const payload = {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      perfil: perfilFormatado
    };

    // Assinatura com expiração de 8 horas
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });

    logger.info('AUTH', `Login com sucesso para ID ${usuario.id} (${usuario.email}) - Perfil: ${perfilFormatado}`);

    return res.status(200).json({
      status: 'sucesso',
      mensagem: 'Login realizado com sucesso',
      token,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        perfil: perfilFormatado
      }
    });

  } catch (erro) {
    console.error('DETALHE REAL DO ERRO NO LOGIN:', erro);
    logger.error('AUTH', `Erro interno durante o login: ${erro.message}`);
    return res.status(500).json({
      status: 'erro',
      mensagem: 'Erro interno no servidor ao processar autenticação.'
    });
  }
};

// 2. GET /api/auth/perfil
exports.obterPerfil = async (req, res) => {
  try {
    const dadosUsuario = req.usuario || req.user;
    return res.status(200).json({
      status: 'sucesso',
      dados: dadosUsuario
    });
  } catch (erro) {
    logger.error('AUTH', `Erro ao recuperar perfil: ${erro.message}`);
    return res.status(500).json({
      status: 'erro',
      mensagem: 'Erro ao consultar perfil autenticado.'
    });
  }
};

// 3. POST /api/auth/logout
exports.logout = (req, res) => {
  return res.status(200).json({
    status: 'sucesso',
    mensagem: 'Logout realizado com sucesso. Descarte o token no cliente.'
  });
};