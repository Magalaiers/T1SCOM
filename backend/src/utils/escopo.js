// De quem são os dados que uma requisição enxerga e altera:
//  - MANAGER logado     -> os dele (dono = id do usuário)
//  - ADMIN ou visitante -> o catálogo-modelo e as equipes oficiais (dono = null)
const donoDoEscopo = (req) => (req.usuario && req.usuario.perfil === 'MANAGER' ? req.usuario.id : null);

module.exports = { donoDoEscopo };