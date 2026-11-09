// Acesso a dados dos tokens JWT revogados (logout): todo o SQL da tabela `tokens_revogados` fica aqui.
const db = require('../config/db');

// Registra o token como revogado. `expiraEm` é o claim exp do JWT (segundos desde 1970).
// INSERT IGNORE: revogar duas vezes o mesmo token não é erro.
// Aproveita para apagar os registros de tokens que já expiraram sozinhos (1 h de folga contra diferença
// de relógio): depois de expirar, o token já é recusado pela própria assinatura.
async function revogar({ jti, usuarioId, expiraEm }) {
  await db.execute(
    'INSERT IGNORE INTO tokens_revogados (jti, usuario_id, expira_em) VALUES (?, ?, ?)',
    [jti, usuarioId, expiraEm]
  );
  await db.execute('DELETE FROM tokens_revogados WHERE expira_em < UNIX_TIMESTAMP() - 3600');
}

async function estaRevogado(jti) {
  const [linhas] = await db.execute('SELECT 1 FROM tokens_revogados WHERE jti = ? LIMIT 1', [jti]);
  return linhas.length > 0;
}

module.exports = { revogar, estaRevogado };