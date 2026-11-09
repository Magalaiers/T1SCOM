// Política de CORS: quais origens (sites) o navegador pode usar para chamar esta API.
// Antes qualquer site podia chamar a API (cors() sem restrição); agora só origens conhecidas.
//
//  - CORS_ORIGIN definido no .env (lista separada por vírgula): somente essas origens.
//        CORS_ORIGIN=http://127.0.0.1:5500,https://meusite.com
//  - CORS_ORIGIN vazio: somente o próprio computador (localhost, 127.0.0.1 e ::1, em qualquer porta),
//    o que cobre Live Server, http.server etc. durante o desenvolvimento.
//  - Origem "null" (index.html aberto direto do disco): aceita apenas fora de produção.
//  - Requisição sem cabeçalho Origin (curl, testes, mesmo servidor) não passa por CORS.
const cors = require('cors');

const LOOPBACK = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/;

function origemPermitida(origem, { lista = [], producao = false } = {}) {
  if (!origem) return true;
  if (lista.length > 0) return lista.includes(origem);
  if (origem === 'null') return !producao;
  return LOOPBACK.test(origem);
}

function criarCors(env = process.env) {
  const lista = String(env.CORS_ORIGIN || '').split(',').map((o) => o.trim()).filter(Boolean);
  const producao = env.NODE_ENV === 'production';

  return cors({
    origin: (origem, retorno) => retorno(null, origemPermitida(origem, { lista, producao })),
    maxAge: 600
  });
}

module.exports = { criarCors, origemPermitida };