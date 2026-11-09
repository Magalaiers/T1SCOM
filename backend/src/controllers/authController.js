const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../config/jwt');
const logger = require('../utils/logger');
const { erro, erroValidacao, erroInterno, sucesso } = require('../utils/respostas');
const { validarLogin, validarRegistro } = require('../utils/validators');
const usuarioRepo = require('../repositories/usuarioRepository');
const tokenRepo = require('../repositories/tokenRepository');
const pilotoRepo = require('../repositories/pilotoRepository');
const { comTransacao } = require('../repositories/transacao');

// Hash descartável: quando o usuário não existe, ainda executamos um bcrypt.compare
// para que o tempo de resposta não revele se o e-mail/nome está cadastrado.
const HASH_FALSO = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10);

// POST /api/auth/login
exports.login = async (req, res) => {
  const { valido, erros, dados } = validarLogin(req.body);
  if (!valido) return erroValidacao(res, erros, erros[0].mensagem);

  const { identificador, senha } = dados;

  try {
    // "@" => busca por e-mail; senão por nome de usuário (o cadastro proíbe "@" no nome)
    const usuario = identificador.includes('@')
      ? await usuarioRepo.buscarPorEmail(identificador.toLowerCase())
      : await usuarioRepo.buscarPorNome(identificador);
    const senhaCorreta = await bcrypt.compare(senha, usuario ? usuario.senha_hash : HASH_FALSO);

    if (!usuario || !senhaCorreta) {
      logger.warn('AUTH', `Falha de autenticação para "${identificador.slice(0, 60)}" ip=${req.ip}`);
      return erro(res, 401, 'Credenciais inválidas.');
    }

    const payload = { id: usuario.id, nome: usuario.nome, email: usuario.email, perfil: usuario.perfil };
    // jwtid: identificador único do token (jti). É ele que o logout revoga.
    const token = jwt.sign(payload, JWT_SECRET, { algorithm: 'HS256', expiresIn: JWT_EXPIRES_IN, jwtid: crypto.randomUUID() });

    logger.info('AUTH', `Login com sucesso: ID ${usuario.id} (${usuario.email}) perfil ${usuario.perfil} ip=${req.ip}`);

    return sucesso(res, 200, { mensagem: 'Login realizado com sucesso', token, usuario: payload });
  } catch (excecao) {
    logger.error('AUTH', `Erro interno durante o login: ${excecao.message}`);
    return erroInterno(res, excecao, 'Erro interno no servidor ao processar autenticação.');
  }
};

// GET /api/auth/perfil  (exige token)
exports.obterPerfil = (req, res) => {
  const { id, nome, email, perfil } = req.usuario;
  return sucesso(res, 200, { dados: { id, nome, email, perfil } });
};

// POST /api/auth/logout  (exige token)
// O token usado na requisição é revogado no servidor: a partir daqui qualquer uso dele retorna 401,
// mesmo antes de expirar. Outros tokens do mesmo usuário (outro login) continuam válidos.
exports.logout = async (req, res) => {
  try {
    await tokenRepo.revogar({ jti: req.token.jti, usuarioId: req.usuario.id, expiraEm: req.token.exp });
    logger.info('AUTH', `Logout: ID ${req.usuario.id} (${req.usuario.email}), token revogado`);
    return sucesso(res, 200, { mensagem: 'Logout realizado com sucesso. Este token não pode mais ser usado.' });
  } catch (excecao) {
    logger.error('AUTH', `Erro ao revogar o token no logout (usuário ${req.usuario.id}): ${excecao.message}`);
    return erroInterno(res, excecao, 'Erro interno ao encerrar a sessão.');
  }
};

// POST /api/auth/registrar  (sempre cria perfil MANAGER: o cliente não escolhe o perfil)
exports.registrar = async (req, res) => {
  const { valido, erros, dados } = validarRegistro(req.body);
  if (!valido) return erroValidacao(res, erros, erros[0].mensagem);

  try {
    const existentes = await usuarioRepo.buscarPorEmailOuNome(dados.email, dados.nome);

    if (existentes.length > 0) {
      const nomeEmUso = existentes.some((u) => u.nome.toLowerCase() === dados.nome.toLowerCase());
      return erro(res, 409, nomeEmUso
        ? 'Este nome de usuário já está em uso. Por favor, escolha outro.'
        : 'Este e-mail já está cadastrado no sistema.');
    }

    const senhaHash = await bcrypt.hash(dados.senha, 10);

    // Cria a conta e já entrega a cópia pessoal do catálogo; se a cópia falhar, a conta também não é criada
    const novoId = await comTransacao(async (conexao) => {
      const id = await usuarioRepo.inserir({ nome: dados.nome, email: dados.email, senhaHash, perfil: 'MANAGER' }, conexao);
      await pilotoRepo.copiarCatalogoPara(id, conexao);
      return id;
    });

    logger.info('AUTH', `Novo usuário cadastrado: ${dados.email} (ID ${novoId}) com cópia do catálogo`);
    return sucesso(res, 201, { mensagem: 'Conta criada com sucesso! Você já pode fazer login.' });
  } catch (excecao) {
    if (excecao.code === 'ER_DUP_ENTRY') { // corrida entre dois cadastros: o banco é a última barreira
      return erro(res, 409, usuarioRepo.campoDuplicado(excecao) === 'nome'
        ? 'Este nome de usuário já está em uso. Por favor, escolha outro.'
        : 'Este e-mail já está cadastrado no sistema.');
    }
    logger.error('AUTH', `Erro ao registrar usuário: ${excecao.message}`);
    return erroInterno(res, excecao, 'Erro interno ao processar o cadastro.');
  }
};