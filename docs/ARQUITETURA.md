# Arquitetura do sistema

## 1. Visão geral

O sistema segue o modelo **cliente-servidor** com três camadas lógicas bem separadas:

```
┌──────────────────────────┐   HTTP + JSON    ┌──────────────────────────────────────────┐   SQL    ┌───────────┐
│ INTERFACE                │ ───────────────► │ LÓGICA DE APLICAÇÃO (API REST, Node.js)  │ ───────► │ BANCO     │
│ frontend/ (HTML/CSS/JS)  │ ◄─────────────── │ rotas → middlewares → controllers        │ ◄─────── │ MySQL     │
│ roda no navegador        │   token JWT no   │            └─► utils (validação, logs)   │ consultas│ schema.sql│
└──────────────────────────┘   cabeçalho      │ acesso a dados: repositories/ → db.js    │ param.   └───────────┘
                                              └──────────────────────────────────────────┘
```

**Padrão adotado:** arquitetura em camadas, equivalente a um **MVC simplificado**. A *View* é o frontend (separado e consumindo a API); o *Controller* fica em `backend/src/controllers`; o *Model* é o esquema relacional em `database/schema.sql`, acessado exclusivamente pelos repositórios de `backend/src/repositories`, que usam o pool de conexões de `backend/src/config/db.js`.

## 2. Responsabilidade de cada camada

| Camada | Onde | Responsabilidade |
|---|---|---|
| Interface | `frontend/` | Exibir dados, coletar entradas, chamar a API com `fetch`, guardar o token no `localStorage` e escapar todo texto antes de inseri-lo na página |
| Rotas | `backend/src/routes/` | Associar método + URL a um controller e declarar quais perfis podem acessar |
| Middlewares | `backend/src/middlewares/` | Autenticar o token JWT e aplicar o controle de acesso por perfil (RBAC) |
| Controllers | `backend/src/controllers/` | Tratar a requisição, aplicar as regras de negócio e montar a resposta HTTP (não contêm SQL) |
| Repositórios | `backend/src/repositories/` | Acesso a dados: concentram todo o SQL do sistema, com consultas parametrizadas (`pilotoRepository`, `equipeRepository`, `usuarioRepository`) |
| Utilitários | `backend/src/utils/` | `validators.js` (validação, sanitização e cálculos de negócio, sem acesso a banco), `respostas.js` (formato padrão de resposta e de erro), `logger.js` (logs com timestamp) |
| Configuração | `backend/src/config/` | `db.js` (pool MySQL) e `jwt.js` (segredo e validade, vindos do `.env`) |
| Banco de dados | `database/schema.sql` | Estrutura, chaves e restrições de integridade |

## 3. Fluxo de uma requisição

Exemplo: `PUT /api/pilotos/12` (editar piloto).

1. O navegador envia o JSON com o cabeçalho `Authorization: Bearer <token>`.
2. `server.js` interpreta o corpo (`express.json`) e encaminha para `routes/pilotoRoutes.js`.
3. `autenticarToken` valida a assinatura e a expiração do token e coloca o usuário em `req.usuario` (ou responde `401`).
4. `autorizarPerfis` confere se o perfil pode editar (ou responde `403`).
5. `pilotoController.atualizarPiloto` busca o piloto pelo repositório (ou responde `404`), mescla os campos enviados com os atuais e chama `validators.validarPiloto` (ou responde `400` com a lista de erros por campo).
6. O controller confere se a equipe existe, recalcula as estrelas quando algum atributo mudou e pede ao repositório que grave (`UPDATE` parametrizado).
7. O evento é registrado em `logs/app.log` e a resposta padronizada `{ status, mensagem, dados }` volta ao cliente.
8. Qualquer erro inesperado cai no tratamento central de `server.js` e é respondido como `500`. Detalhes técnicos só aparecem com `NODE_ENV=development`.

## 4. Modelo de dados

```
campeonatos (1) ────< (N) equipes (1) ────< (N) pilotos          usuarios (independente)
```

| Tabela | Chave primária | Chaves estrangeiras | Restrições principais |
|---|---|---|---|
| `campeonatos` | `id` | — | `nome` UNIQUE e NOT NULL |
| `equipes` | `id` | `campeonato_id` → `campeonatos` (RESTRICT) | `nome` UNIQUE e NOT NULL |
| `pilotos` | `id` | `equipe_id` → `equipes` (SET NULL) | `CHECK` de idade (16–60), salário (≥ 0), apelo comercial (0–100), estrelas (0–5, potencial ≥ atual) e dos 9 atributos (0–20) |
| `usuarios` | `id` | — | `email` UNIQUE e NOT NULL; `perfil` restrito a `ADMIN`/`MANAGER` |

Decisões de modelagem:

- Os 9 atributos técnicos são **colunas próprias** (e não um JSON), para que o banco aplique os limites de 0 a 20.
- `overrall` é uma **coluna gerada** (`ROUND(estrelas_atuais * 20)`), então nunca fica inconsistente com as estrelas.
- Índices adicionais em `pilotos(overrall)`, `pilotos(nome)` e `pilotos(status_contrato)`, usados em ordenação e filtros.
- Excluir uma equipe não apaga seus pilotos: eles viram agentes livres (`ON DELETE SET NULL`).

## 5. Principais decisões de projeto

| Decisão | Motivo |
|---|---|
| Autenticação por **JWT** (HS256, validade de 8 h) no cabeçalho `Authorization` | API sem estado, adequada a um frontend separado |
| Senhas com **bcrypt** (custo 10) | Hash lento e com sal, nunca guarda a senha em texto |
| Validação **centralizada** em `validators.js` | Regras num só lugar e testáveis sem banco |
| Todo o SQL em **repositórios** | Controllers sem SQL; qualquer regra de acesso aos dados (como um filtro) muda em um só lugar |
| Respostas e erros **padronizados** em `respostas.js` | Frontend e testes dependem de um formato único |
| Segredos **somente no `.env`**; `JWT_SECRET` obrigatório | Nenhuma credencial no código ou no Git; o servidor recusa iniciar sem o segredo |
| Cadastro público **sempre cria `MANAGER`** | O cliente não escolhe o próprio perfil; o `ADMIN` nasce no `seed` |
| Estrelas **recalculadas só quando um atributo muda** | Preserva os valores originais do jogo ao editar apenas salário, equipe etc. |

## 6. Segurança por camada

| Ameaça | Proteção | Onde | Teste automatizado |
|---|---|---|---|
| SQL Injection | Consultas parametrizadas (`execute`) concentradas nos repositórios; identificadores validados como inteiros | repositórios, `validarId` | pilotos nº 11 e 5; auth B6 |
| XSS | Sanitização na entrada (remove `<` e `>`) e escape de toda saída em HTML (`esc()`); mensagens de erro via `textContent` | `validators.js`, `script.js` | pilotos nº 12 |
| CSRF | **Não se aplica**: o token vai no cabeçalho `Authorization`, não em cookie, então o navegador não o envia automaticamente | — | — |
| Acesso sem login | `autenticarToken` nas rotas de escrita | middleware | pilotos nº 3; auth B10 |
  | Perfil insuficiente | `autorizarPerfis` por rota | middleware | pilotos nº 4 |
| Token forjado, expirado ou `alg: none` | Verificação restrita a HS256 com o segredo do servidor | middleware | auth B11 |
| Força bruta e enumeração de usuários | Mesma resposta `401` para usuário ou senha errados, com comparação bcrypt mesmo se o usuário não existe | `authController` | auth B5 |
| Escalada de privilégio | Perfil fixo no cadastro; campo `perfil` do corpo é ignorado | `authController` | auth B4 |
| Senha em texto no banco | Apenas hash bcrypt é aceito no login | `authController` | auth B8 e B9 |
| Forja de linhas no log | Quebras de linha de dados do usuário são removidas antes de gravar | `logger.js` | verificação manual |

## 7. Observabilidade

`logger.js` grava em `backend/logs/app.log` (e na saída padrão) uma linha por evento, com timestamp ISO 8601, nível e módulo. Eventos registrados: login com sucesso, falha de autenticação, acesso negado (401 e 403), logout, cadastro de usuário, criação, edição e exclusão de piloto e erros internos.

## 8. Limitações conhecidas

- **O logout não invalida o token no servidor.** O JWT continua válido até expirar; o cliente o descarta.
- **O token fica no `localStorage`**, que é legível por scripts da página. A mitigação é a sanitização e o escape contra XSS descritos acima.
- **O CORS está aberto a qualquer origem** (`cors()` padrão), adequado a desenvolvimento. Em produção, restringir à origem do frontend.
- **Não há limite de tentativas de login nem paginação no servidor.** A paginação do catálogo é feita no navegador.