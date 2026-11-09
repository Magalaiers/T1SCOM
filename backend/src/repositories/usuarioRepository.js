// Acesso a dados de usuários: todo o SQL da tabela `usuarios` fica aqui.
const db = require('../config/db');

async function buscarPorEmail(email) {
  const [linhas] = await db.execute(
    'SELECT id, nome, email, senha_hash, perfil FROM usuarios WHERE email = ? LIMIT 1',
    [email]
  );
  return linhas[0] || null;
}

async function buscarPorNome(nome) {
  const [linhas] = await db.execute(
    'SELECT id, nome, email, senha_hash, perfil FROM usuarios WHERE nome = ? LIMIT 1',
    [nome]
  );
  return linhas[0] || null;
}

// Usado a cada requisição autenticada: confirma que o usuário ainda existe e traz o perfil ATUAL
async function buscarPorId(id) {
  const [linhas] = await db.execute(
    'SELECT id, nome, email, perfil FROM usuarios WHERE id = ? LIMIT 1',
    [id]
  );
  return linhas[0] || null;
}

// Usado para detectar cadastro duplicado (devolve todos os conflitos)
async function buscarPorEmailOuNome(email, nome) {
  const [linhas] = await db.execute(
    'SELECT email, nome FROM usuarios WHERE email = ? OR nome = ?',
    [email, nome]
  );
  return linhas;
}

// Retorna o ID gerado. Aceita uma conexão para participar de uma transação.
async function inserir({ nome, email, senhaHash, perfil }, conexao = db) {
  const [resultado] = await conexao.execute(
    'INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES (?, ?, ?, ?)',
    [nome, email, senhaHash, perfil]
  );
  return resultado.insertId;
}

// ---------------------------------------------------------------------
// Gestão de usuários (ADMIN). A hash da senha NUNCA é selecionada nestas consultas.
// ---------------------------------------------------------------------
const COLUNAS_LISTA = `
  u.id, u.nome, u.email, u.perfil, u.criado_em,
  (SELECT COUNT(*) FROM pilotos p WHERE p.dono_id = u.id) AS total_pilotos,
  (SELECT e.nome FROM equipes e WHERE e.dono_id = u.id) AS equipe_criada,
  (SELECT ce.nome FROM equipe_comandada ec JOIN equipes ce ON ce.id = ec.equipe_id WHERE ec.usuario_id = u.id) AS equipe_comandada
`;

const FILTRO = '(? IS NULL OR u.perfil = ?) AND (? IS NULL OR u.nome LIKE ? OR u.email LIKE ?)';

// Os curingas do LIKE digitados pelo usuário (% e _) são tratados como texto comum.
// Exemplo do escape: a%b_c  ->  a\%b\_c   (o teste U4 de usuarios.test.js confere este comportamento)
function parametrosDoFiltro({ perfil, busca }) {
  const termo = busca === null ? null : `%${busca.replace(/[\\%_]/g, '\\$&')}%`;
  return [perfil, perfil, termo, termo, termo];
}

async function listar(filtros, limite, offset) {
  // limite e offset já foram validados como inteiros: entram direto no SQL (evita incompatibilidade
  // de parâmetros em LIMIT entre versões do MySQL/MariaDB); o restante continua parametrizado.
  const [linhas] = await db.execute(
    `SELECT ${COLUNAS_LISTA} FROM usuarios u WHERE ${FILTRO} ORDER BY u.perfil ASC, u.nome ASC LIMIT ${Number(limite)} OFFSET ${Number(offset)}`,
    parametrosDoFiltro(filtros)
  );
  return linhas;
}

async function contar(filtros) {
  const [[linha]] = await db.execute(`SELECT COUNT(*) AS total FROM usuarios u WHERE ${FILTRO}`, parametrosDoFiltro(filtros));
  return Number(linha.total);
}

async function buscarComContagens(id) {
  const [linhas] = await db.execute(`SELECT ${COLUNAS_LISTA} FROM usuarios u WHERE u.id = ?`, [id]);
  return linhas[0] || null;
}

async function atualizarPerfil(id, perfil, conexao = db) {
  await conexao.execute('UPDATE usuarios SET perfil = ? WHERE id = ?', [perfil, id]);
}

async function atualizarSenha(id, senhaHash) {
  await db.execute('UPDATE usuarios SET senha_hash = ? WHERE id = ?', [senhaHash, id]);
}

// Os pilotos e a equipe do usuário saem junto (ON DELETE CASCADE no banco)
async function excluir(id, conexao = db) {
  const [resultado] = await conexao.execute('DELETE FROM usuarios WHERE id = ?', [id]);
  return resultado.affectedRows > 0;
}

module.exports = {
  buscarPorEmail, buscarPorNome, buscarPorId, buscarPorEmailOuNome, inserir,
  listar, contar, buscarComContagens, atualizarPerfil, atualizarSenha, excluir
};