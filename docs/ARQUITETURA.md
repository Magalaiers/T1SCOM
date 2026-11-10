# Arquitetura do sistema

## 1. Visão geral

O sistema segue o modelo **cliente-servidor** com três camadas lógicas bem separadas:

```
┌──────────────────────────┐   HTTP + JSON    ┌──────────────────────────────────────────┐   SQL    ┌───────────┐
│ INTERFACE                │ ───────────────► │ LÓGICA DE APLICAÇÃO (API REST, Node.js)  │ ───────► │ BANCO     │
│ frontend/ (HTML/CSS/JS)  │ ◄─────────────── │ CORS → rotas → middlewares → controllers │ ◄─────── │ MySQL     │
│ roda no navegador        │   token JWT no   │            └─► utils (validação, logs)   │ consultas│ schema.sql│
└──────────────────────────┘   cabeçalho      │ acesso a dados: repositories/ → db.js    │ param.   └───────────┘
                                              └──────────────────────────────────────────┘
```

**Padrão adotado:** arquitetura em camadas, equivalente a um **MVC simplificado**. A *View* é o frontend (separado e consumindo a API); o *Controller* fica em `backend/src/controllers`; o *Model* é o esquema relacional (`database/schema.sql`) acessado exclusivamente pelos **repositórios** (`backend/src/repositories`), que concentram todo o SQL. Os controllers não contêm SQL.

## 2. Responsabilidade de cada camada

| Camada | Onde | Responsabilidade |
|---|---|---|
| Interface | `frontend/` | Exibir dados, coletar entradas, chamar a API com `fetch`, guardar o token no `localStorage` e escapar todo texto antes de inseri-lo na página |
| CORS | `backend/src/config/cors.js` | Aceitar chamadas de navegador apenas de origens conhecidas (`localhost`/`127.0.0.1` por padrão ou a lista `CORS_ORIGIN` do `.env`) |
| Rotas | `backend/src/routes/` | Associar método + URL a um controller e declarar quais perfis podem acessar |
| Middlewares | `backend/src/middlewares/` | Autenticar o token JWT (inclusive se foi revogado pelo logout) e aplicar o controle de acesso por perfil (RBAC) |
| Controllers | `backend/src/controllers/` | Tratar a requisição, aplicar as regras de negócio e montar a resposta HTTP (não contêm SQL) |
| Repositórios | `backend/src/repositories/` | Acesso a dados: todo o SQL do sistema, com consultas parametrizadas (`pilotoRepository`, `equipeRepository`, `campeonatoRepository`, `usuarioRepository`, `tokenRepository`) e o auxiliar de transações (`transacao.js`) |
| Utilitários | `backend/src/utils/` | `validators.js` (validação, sanitização e cálculos de negócio, sem acesso a banco), `respostas.js` (formato padrão de resposta e de erro), `logger.js` (logs com timestamp), `escopo.js` (de quem são os dados da requisição) e `regrasElenco.js` (limite de elenco por tipo de campeonato) |
| Configuração | `backend/src/config/` | `db.js` (pool MySQL), `jwt.js` (segredo e validade) e `cors.js`, todos vindos do `.env` |
| Banco de dados | `database/schema.sql` | Estrutura, chaves e restrições de integridade |

## 3. Fluxo de uma requisição

Exemplo: `PUT /api/pilotos/12` (editar um piloto).

1. O navegador envia o JSON com o cabeçalho `Authorization: Bearer <token>`.
2. `server.js` aplica o CORS, interpreta o corpo (`express.json`) e encaminha para `routes/pilotoRoutes.js`.
3. `autenticarToken` valida a assinatura (somente HS256) e a expiração do token, exige que ele tenha identificador (`jti`), confere em `tokens_revogados` que não houve logout, e confirma **no banco** que o usuário ainda existe, usando o **perfil atual** dele (ou responde `401`).
4. `autorizarPerfis` confere se o perfil pode editar (ou responde `403`).
5. `pilotoController.atualizarPiloto` descobre o escopo dos dados (`donoDoEscopo`: o MANAGER enxerga a própria cópia; o ADMIN, o catálogo-modelo), busca o piloto **dentro desse escopo** (um piloto de outro dono responde `404`), mescla os campos enviados com os atuais e chama `validators.validarPiloto` (ou responde `400` com a lista de erros por campo).
6. O controller confere se a equipe de destino é visível ao usuário e **tem vaga** (limite de elenco), recalcula as estrelas quando algum atributo mudou e pede ao repositório que grave (`UPDATE` parametrizado).
7. O evento é registrado em `logs/app.log` e a resposta padronizada `{ status, mensagem, dados }` volta ao cliente.
8. Qualquer erro inesperado cai no tratamento central de `server.js` e é respondido como `500`. Detalhes técnicos só aparecem com `NODE_ENV=development`.

## 4. Modelo de dados

```
campeonatos (1) ────< (N) equipes (1) ────< (N) pilotos
                              ▲                    ▲
                              │ dono_id            │ dono_id
usuarios (1) ─────────────────┴────────────────────┘     NULL = oficial / catálogo-modelo
    │
    ├────< tokens_revogados            (logout: tokens que não valem mais)
    └──── equipe_comandada >──── equipes   (qual equipe o MANAGER comanda, no máximo uma)
```

| Tabela | Chave primária | Chaves estrangeiras | Restrições principais |
|---|---|---|---|
| `usuarios` | `id` | — | `email` UNIQUE, **`nome` UNIQUE** (o login aceita nome de usuário), `perfil` restrito a `ADMIN`/`MANAGER`, todos NOT NULL |
| `tokens_revogados` | `jti` | `usuario_id` → `usuarios` (CASCADE) | `expira_em` (exp do JWT, em segundos) com índice, para a limpeza dos expirados |
| `campeonatos` | `id` | — | `nome` UNIQUE e NOT NULL; `tipo` (Single Seater, GT ou Endurance) e `categoria` (Tier) |
| `equipes` | `id` | `campeonato_id` → `campeonatos` (RESTRICT); `dono_id` → `usuarios` (CASCADE) | `UNIQUE (dono_id)`: no máximo **uma equipe criada por MANAGER** (as oficiais têm `dono_id` NULL) |
| `equipe_comandada` | `usuario_id` | `usuario_id` → `usuarios` (CASCADE); `equipe_id` → `equipes` (CASCADE) | A chave primária em `usuario_id` garante **no máximo uma equipe comandada** por usuário |
| `pilotos` | `id` | `equipe_id` → `equipes` (SET NULL); `dono_id` → `usuarios` (CASCADE) | `CHECK` de idade (16–60), salário (≥ 0), apelo comercial (0–100), estrelas (0–5, potencial ≥ atual) e dos 9 atributos (0–20) |

Decisões de modelagem:

- **`dono_id` define a quem pertence o registro.** Em `pilotos`, `NULL` é o **catálogo-modelo** (o que o visitante vê e o ADMIN edita) e um id de usuário é a **cópia pessoal** desse MANAGER. Em `equipes`, `NULL` é uma **equipe oficial** do jogo (compartilhada e somente leitura) e um id de usuário é a equipe que ele criou. Ao excluir o usuário, tudo que pertence a ele sai junto (`ON DELETE CASCADE`).
- Os 9 atributos técnicos são **colunas próprias** (e não um JSON), para que o banco aplique os limites de 0 a 20.
- `overrall` é uma **coluna gerada** (`ROUND(estrelas_atuais * 20)`), então nunca fica inconsistente com as estrelas.
- Índices adicionais em `pilotos(overrall)`, `pilotos(nome)`, `pilotos(status_contrato)`, `equipes(nome)` e `tokens_revogados(expira_em)`, usados em ordenação, filtros e limpeza.
- Excluir uma equipe não apaga seus pilotos: eles viram agentes livres (`ON DELETE SET NULL`).
- A tabela `usuarios` e a `tokens_revogados` **sobrevivem** a uma nova execução do `schema.sql`; as demais são recriadas e repovoadas pelo `npm run seed`.

### Campeonatos e equipes oficiais

São 7 campeonatos e 62 equipes oficiais: 3 divisões de monopostos (*World Motorsport Championship*, *Asia-Pacific Super Cup* e *European Racing Series*), 2 de GT (*International GT Championship* e *GT Challenger Series*) e 2 classes de Endurance (*International Endurance Cup*, classes A e B).

O `Teams.csv` do jogo não informa o campeonato de cada equipe. O `seed.js` o recupera pela **ordem** das equipes no arquivo, em blocos de 10, 10, 10, 10, 10, 6 e 6 equipes. Duas conferências nos dados sustentam essa leitura: dentro de cada tipo de série, a habilidade média dos pilotos cai de um bloco para o seguinte (monopostos 14,9 → 11,2 → 8,3; GT 13,0 → 10,3; Endurance 13,4 → 10,9) e as 12 equipes de Endurance são exatamente as que têm 6 pilotos. O resultado foi conferido equipe por equipe com a tabela de equipes por campeonato do jogo (62 de 62), e os testes `campeonatos.test.js` (K1 a K3) travam essa distribuição, inclusive a lista de equipes de cada campeonato (K3).

## 5. Autenticação e sessão

- **Cadastro** (`POST /api/auth/registrar`): sempre cria `MANAGER` e, na mesma transação, entrega a cópia do catálogo. O campo `perfil` do corpo é ignorado.
- **Login** (`POST /api/auth/login`): aceita e-mail ou nome de usuário. Compara a senha com **bcrypt** (e executa a comparação mesmo quando o usuário não existe, para não revelar quem está cadastrado) e emite um **JWT HS256** com validade de 8 h, contendo `id`, `nome`, `email`, `perfil` e um **identificador único (`jti`)**.
- **Cada requisição autenticada** confirma no banco que o usuário existe e usa o **perfil atual** dele. O perfil escrito dentro do token nunca é confiável: se um ADMIN alterar o perfil de alguém, o mesmo token passa a valer com o novo perfil na hora; se o usuário for excluído, o token passa a responder `401`.
- **Logout** (`POST /api/auth/logout`): grava o `jti` do token em `tokens_revogados`; depois disso, qualquer uso daquele token responde `401` ("Sessão encerrada"), inclusive nas rotas de autenticação opcional. O logout revoga **apenas o token usado**; outro login do mesmo usuário continua válido. Os registros de tokens que já expiraram sozinhos são apagados a cada logout.
- Tokens sem `jti` ou `exp` são recusados, assim como tokens expirados, assinados com outro segredo ou com `alg: none`.

## 6. Controle de acesso e isolamento de dados

O controle acontece em duas etapas: o **perfil** decide *quais operações* a rota aceita (`autorizarPerfis`), e o **escopo** decide *de quem são os dados* que a operação enxerga (`donoDoEscopo`).

| Operação | Visitante | MANAGER | ADMIN |
|---|:-:|:-:|:-:|
| Consultar pilotos, equipes e campeonatos | ✔ (catálogo) | ✔ (a sua cópia) | ✔ (catálogo) |
| Cadastrar, editar e excluir pilotos | ✘ | ✔ (a sua cópia) | ✔ (catálogo-modelo) |
| Restaurar a própria cópia do catálogo | ✘ | ✔ | ✘ |
| Comandar uma equipe (assumir, criar, editar, deixar) | ✘ | ✔ | ✘ |
| Gerenciar usuários | ✘ | ✘ | ✔ |

- **Isolamento (anti-IDOR):** toda consulta de piloto filtra por `dono_id`. Um recurso que existe, mas pertence a outro usuário, responde `404`, como se não existisse, e nada é alterado.
- Alterações do ADMIN no catálogo-modelo **não** mudam as cópias que os MANAGERs já têm; só quem se cadastrar depois recebe a versão atual.
- **Salvaguardas na gestão de usuários:** o ADMIN não altera o próprio perfil nem exclui a própria conta (`409`), o que garante que sempre reste ao menos um ADMIN. Promover um MANAGER a ADMIN apaga os dados pessoais dele; rebaixar um ADMIN a MANAGER entrega uma cópia nova do catálogo.

## 7. Regras de negócio

- **Dados por usuário:** ao se cadastrar, o MANAGER recebe uma cópia completa dos 259 pilotos. "Restaurar meus dados" descarta as edições, a equipe criada e a equipe comandada, e entrega uma cópia nova (em uma transação).
- **Minha Equipe:** cada MANAGER comanda no máximo uma equipe, que pode ser **oficial** (compartilhada e somente leitura: ele só contrata e dispensa, e as mudanças ficam na cópia dele; dois MANAGERs podem comandar a mesma equipe sem se afetar) ou **criada por ele**. Para trocar, é preciso deixar a atual primeiro (`409` caso contrário); deixar uma equipe criada a exclui e libera os pilotos como agentes livres.
- **Limite de elenco:** equipes de Endurance comportam 6 pilotos; as de monopostos e GT, 3. A regra fica em um só lugar (`regrasElenco.js`), e as equipes oficiais nunca ficam abaixo do elenco com que vieram do jogo. Mover um piloto para uma equipe cheia responde `400`. Mudar o campeonato de uma equipe criada é recusado se o elenco atual não couber no novo limite.
- **Estrelas:** só são recalculadas (média dos 9 atributos) quando algum atributo muda, o que preserva os valores originais do jogo ao editar apenas salário, equipe etc. O potencial nunca fica abaixo das estrelas atuais.

## 8. Principais decisões de projeto

| Decisão | Motivo |
|---|---|
| Autenticação por **JWT** (HS256, 8 h) com **`jti` e lista de revogação** | API sem estado para o frontend separado, mas com **logout de verdade** |
| Perfil sempre lido do **banco** a cada requisição | Mudança de perfil e exclusão de usuário valem imediatamente; um token forjado não eleva privilégios |
| Senhas com **bcrypt** (custo 10) | Hash lento e com sal; a senha nunca é guardada em texto |
| Validação **centralizada** em `validators.js` | Regras num só lugar e testáveis sem banco |
| Todo o SQL em **repositórios** | Controllers sem SQL; qualquer regra de acesso aos dados (como o filtro por dono) muda em um só lugar |
| **Cópia pessoal** do catálogo por MANAGER | Cada usuário edita livremente sem afetar os demais |
| **Transações** nas operações compostas (cadastro, restaurar, mudar perfil, deixar equipe) | Ou tudo acontece, ou nada |
| Respostas e erros **padronizados** em `respostas.js` | Frontend e testes dependem de um formato único |
| Segredos **somente no `.env`**; `JWT_SECRET` obrigatório | Nenhuma credencial no código ou no Git; o servidor recusa iniciar sem o segredo |
| **CORS restrito** a origens conhecidas | Sites de terceiros não conseguem ler as respostas da API no navegador |
| Restrições também **no banco** (UNIQUE, FK, CHECK) | O banco é a última barreira, inclusive contra cadastros simultâneos |

## 9. Segurança por camada

Teste automatizado = arquivo › identificador (os arquivos ficam em `backend/tests/`).

| Ameaça | Proteção | Onde | Teste automatizado |
|---|---|---|---|
| SQL Injection | Consultas parametrizadas (`execute`) concentradas nos repositórios; identificadores validados como inteiros; curingas do `LIKE` escapados na busca | repositórios, `validarId` | pilotos › 11; auth › B6; usuario › U4 |
| XSS | Sanitização na entrada (remove `<` e `>`) e escape de toda saída em HTML (`esc()`); mensagens de erro via `textContent` | `validators.js`, `script.js` | pilotos › 12; equipe-propria › E17 |
| CSRF | **Não se aplica**: o token vai no cabeçalho `Authorization`, não em cookie, então o navegador não o envia sozinho | — | — |
| Acesso sem login | `autenticarToken` nas rotas protegidas | middleware | pilotos › 3; auth › B10; usuario › U1 |
| Perfil insuficiente | `autorizarPerfis` por rota | middleware | pilotos › 4; equipe-propria › E13; usuario › U1 |
| Acesso a dados de outro usuário (IDOR) | Filtro por `dono_id` em todas as consultas; recurso alheio responde `404` | repositórios | dpu › I3, I4; equipe-propria › E9 |
| Token forjado, expirado ou `alg: none` | Verificação restrita a HS256 com o segredo do servidor; `jti` e `exp` obrigatórios | middleware | auth › B11; logout › L4 |
| **Reutilização de token após o logout** | Revogação do `jti` em `tokens_revogados` | middleware, `authController` | logout › L1, L2, L6 |
| Escalada de privilégio | Perfil fixo no cadastro; perfil do token ignorado (vale o do banco) | `authController`, middleware | auth › B4, B13; dpu › I9 |
| Usuário excluído continua usando o token | O middleware confirma o usuário no banco | middleware | dpu › I10; usuario › U13 |
| Enumeração de usuários e força bruta de senha | Mesma resposta `401` para usuário ou senha errados, com comparação bcrypt mesmo se o usuário não existe | `authController` | auth › B5 |
| Senha em texto no banco | Apenas hash bcrypt é aceito no login | `authController` | auth › B8, B9; usuario › U12 |
| Nomes de usuário duplicados (inclusive em cadastros simultâneos) | `UNIQUE (nome)` no banco, com mensagem específica | `schema.sql`, `authController` | banco › D1, D2 |
| Chamadas de sites de terceiros pelo navegador | CORS com lista de origens permitidas | `config/cors.js` | cors › C2, C5, C6 |
| Forja de linhas no log | Quebras de linha de dados do usuário são removidas antes de gravar | `logger.js` | verificação manual |

## 10. Observabilidade

`logger.js` grava em `backend/logs/app.log` (e na saída padrão) uma linha por evento, com timestamp ISO 8601, nível e módulo, por exemplo:

```
[2026-11-09T14:02:11.482Z] [INFO] [AUTH] Login com sucesso: ID 7 (carlos@exemplo.com) perfil MANAGER ip=127.0.0.1
[2026-11-09T14:02:40.115Z] [WARN] [AUTH] Falha de autenticação para "carlos@exemplo.com" ip=127.0.0.1
```

Eventos registrados: login com sucesso, falha de autenticação, acesso negado (401, 403, token inválido, token revogado), logout, cadastro de usuário, criação, edição e exclusão de pilotos e equipes, gestão de usuários pelo ADMIN (criação, mudança de perfil, redefinição de senha e exclusão) e erros internos. A senha nunca é registrada. O arquivo está no `.gitignore`.

## 11. Testes automatizados

98 testes em 9 suítes (`npm test`), com Jest e Supertest, executados contra um banco real:

| Arquivo | Testes | O que cobre |
|---|---:|---|
| `pilotos.test.js` | 22 | Validação e regras de negócio (funções puras) e CRUD de pilotos pela API, com casos válidos e inválidos |
| `auth.test.js` | 16 | Cadastro, login, token, perfis e ataques (injeção, token forjado) |
| `dpu.test.js` | 10 | Cópia por usuário, isolamento e restauração |
| `equipe-propria.test.js` | 17 | Assumir, criar e deixar equipe, e limite de elenco |
| `usuario.test.js` | 14 | Gestão de usuários pelo ADMIN e suas salvaguardas |
| `logout.test.js` | 7 | Revogação do token no logout |
| `banco.test.js` | 3 | Restrições do próprio banco |
| `cors.test.js` | 6 | Política de origens |
| `campeonatos.test.js` | 3 | Distribuição das equipes pelos campeonatos, limite de elenco e conferência com a tabela de equipes do jogo |

## 12. Limitações conhecidas

- **O token fica no `localStorage`**, que é legível por scripts da página. A mitigação é a sanitização e o escape contra XSS descritos acima.
- **Não há limite de tentativas de login** (rate limiting).
- **Redefinir a senha de um usuário não encerra as sessões que ele já tem abertas**: o logout revoga apenas o token usado, e um token vale até expirar (8 h) ou até o usuário ser excluído.
- **A listagem de pilotos não é paginada no servidor** (259 registros; a paginação do catálogo é feita no navegador). A listagem de usuários é paginada no servidor.
- **O limite de elenco confere a contagem antes de gravar**: duas contratações simultâneas na mesma última vaga poderiam, em tese, passar juntas.
- **Os campeonatos das equipes oficiais são derivados da ordem do arquivo do jogo** (seção 4), pois o CSV não tem essa coluna. A derivação foi conferida com a tabela de equipes do jogo e é travada pelos testes; se o arquivo for regenerado com outra ordem, o `seed.js` precisa ser ajustado.
- Os `PUT` aceitam atualização parcial (campos omitidos mantêm o valor atual), o que na prática é o comportamento de um `PATCH`.