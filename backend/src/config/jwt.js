// Configuração do JWT. O segredo NUNCA fica no código: vem do .env.
// Sem JWT_SECRET o servidor se recusa a iniciar (falha rápida, em vez de assinar com um valor conhecido).
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET não definido. Configure-o em backend/.env (veja .env.example).');
}

module.exports = {
  JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '8h'
};