# MM PitWall — Comparador e gerenciador de pilotos do Motorsport Manager

Projeto da disciplina de **Sistemas Computacionais (SCOM)**, baseado no jogo *Motorsport Manager*.

- **Trabalho 1:** site (HTML, CSS e JavaScript) que compara pilotos e equipes do jogo, a partir dos dados extraídos de `Drivers.csv` e `Teams.csv`.
- **Trabalho 2:** o site ganhou um **backend** (API REST em Node.js/Express), **banco relacional** (MySQL/MariaDB), **autenticação** (JWT), **controle de acesso por perfil**, validação, logs e testes automatizados.

## O que o sistema faz

| Perfil | O que pode fazer |
|---|---|
| **Visitante** (sem login) | Consultar e comparar o catálogo de pilotos e as equipes |
| **MANAGER** | Tudo do visitante, sobre a **sua cópia pessoal** dos pilotos: cadastrar, editar, excluir e restaurar o catálogo original. Pode **comandar uma equipe**: assumir uma das 62 equipes do jogo ou criar a própria, contratar e dispensar pilotos respeitando o limite de elenco |
| **ADMIN** | Edita o **catálogo-modelo** (a base copiada para cada novo usuário) e **gerencia os usuários**: criar, alterar perfil, redefinir senha e excluir |

O cadastro público sempre cria um `MANAGER`. O `ADMIN` é criado pelo `npm run seed`, com os dados do `.env`.

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Interface | HTML, CSS e JavaScript puro (sem frameworks) |
| API | Node.js, Express 5, `jsonwebtoken`, `bcryptjs`, `cors` |
| Banco de dados | MySQL 8 ou MariaDB 10.2+ (`mysql2`, com consultas parametrizadas) |
| Testes | Jest e Supertest (98 testes) |

## Estrutura de pastas

```
.
├── backend/
│   ├── server.js                 # ponto de entrada: CORS, JSON, rotas e tratamento central de erros
│   ├── seed.js                   # popula o banco com os dados do jogo e cria o ADMIN
│   ├── dados.json                # dados extraídos do jogo (gerado por converter.py)
│   ├── .env.example              # modelo das variáveis de ambiente
│   ├── src/
│   │   ├── config/               # db.js (pool MySQL), jwt.js (segredo), cors.js (origens permitidas)
│   │   ├── routes/               # método + URL → controller (e perfis permitidos)
│   │   ├── middlewares/          # autenticação (JWT) e autorização por perfil
│   │   ├── controllers/          # regras de negócio e respostas HTTP (sem SQL)
│   │   ├── repositories/         # todo o SQL do sistema (acesso a dados)
│   │   └── utils/                # validação, respostas padronizadas, logs, regras de elenco
│   └── tests/                    # testes automatizados
├── database/
│   └── schema.sql                # criação do banco (tabelas, chaves e restrições)
├── frontend/                     # interface (index.html, login.html, script.js, style.css)
├── docs/
│   ├── API.md                    # documentação de todos os endpoints
│   └── ARQUITETURA.md            # arquitetura, modelo de dados e decisões de projeto
├── converter.py                  # (Trabalho 1) converte os CSVs do jogo em dados.json
├── Drivers.csv, Teams.csv        # dados originais do jogo
└── README.md
```

## Como executar

### Requisitos

- **Node.js** 18 ou superior
- **MySQL 8** ou **MariaDB 10.2+** (o do XAMPP serve)
- Um jeito de servir o frontend: extensão **Live Server** do VS Code, ou **Python** (`python -m http.server`)

### 1. Instalar as dependências

```
cd backend
npm install
```

### 2. Criar o arquivo `.env`

Copie o modelo e preencha os valores (o `.env` **nunca** é versionado: está no `.gitignore`):

```
Copy-Item .env.example .env        # PowerShell  (no Linux/macOS: cp .env.example .env)
```

| Variável | O que colocar |
|---|---|
| `PORT` | Porta da API (padrão `3000`) |
| `NODE_ENV` | `development` mostra detalhes técnicos nas respostas de erro; em qualquer outro valor eles são omitidos |
| `DB_HOST`, `DB_PORT` | Servidor do banco (em geral `localhost` e `3306`) |
| `DB_NAME` | `motorsport_db` (nome criado pelo `schema.sql`) |
| `DB_USER`, `DB_PASSWORD` | Usuário e senha do seu MySQL (no XAMPP: `root` e senha vazia) |
| `JWT_SECRET` | Segredo para assinar os tokens. **Obrigatório**: sem ele o servidor não inicia. Para gerar um: `node -p "require('crypto').randomBytes(48).toString('hex')"` |
| `CORS_ORIGIN` | Sites autorizados a chamar a API pelo navegador, separados por vírgula. **Deixe vazio** no desenvolvimento (libera `localhost`, `127.0.0.1` e `::1` em qualquer porta) |
| `ADMIN_NOME`, `ADMIN_EMAIL`, `ADMIN_SENHA` | Conta ADMIN criada pelo seed (senha com 8+ caracteres, com letra e número) |

### 3. Criar o banco de dados

Escolha uma forma:

- **phpMyAdmin:** aba **Importar** (ou **SQL**) e execute o arquivo `database/schema.sql`.
- **Terminal:** `mysql -u root -p < database/schema.sql`. No PowerShell o `<` não funciona; use `Get-Content database\schema.sql -Raw | mysql -u root -p`.

O script cria o banco `motorsport_db` com as tabelas `usuarios`, `tokens_revogados`, `campeonatos`, `equipes`, `equipe_comandada` e `pilotos`. Pode ser executado várias vezes: a tabela `usuarios` é preservada (e recebe a restrição de nome único, se ainda não tiver), enquanto campeonatos, equipes e pilotos são recriados e repovoados pelo seed.

### 4. Popular o banco

```
npm run seed
```

Resultado esperado: `Banco populado: 7 campeonatos, 62 equipes, 259 pilotos no catálogo-modelo.` O seed também cria a conta ADMIN com os dados do `.env` e entrega uma cópia do catálogo a cada MANAGER já cadastrado.

### 5. Iniciar a API e o site

- **API** (em `backend/`): `npm start` (ou `npm run dev`, que reinicia a cada alteração). Deve aparecer `Servidor rodando na porta 3000`.
- **Site:** abra `frontend/index.html` com o **Live Server** (clique com o botão direito no arquivo, *Open with Live Server*; abre em `http://127.0.0.1:5500`), ou, em outro terminal:

  ```
  cd frontend
  python -m http.server 5500
  ```

  e acesse `http://127.0.0.1:5500`.

> O frontend chama a API em `http://localhost:3000`. Se mudar a porta da API, altere o endereço em `frontend/script.js` (constante `API_URL`) e em `frontend/login.js`.

### 6. Rodar os testes automatizados

Com o banco criado e populado (passos 3 e 4):

```
npm test
```

Resultado esperado: **9 suítes e 98 testes passando**. Os testes criam usuários `jest_*` e removem tudo ao final.

### 7. Primeiro acesso

- **ADMIN:** entre em `login.html` com o `ADMIN_EMAIL` e a `ADMIN_SENHA` do `.env`.
- **MANAGER:** na mesma tela, use a aba de cadastro para criar uma conta.
- **Visitante:** basta abrir o site.

## Atualizar um banco que já existe

Se você já tinha o banco de uma versão anterior, o caminho é o mesmo: execute o `database/schema.sql` de novo e depois `npm run seed`. As **contas de usuário são mantidas**; os pilotos e equipes de cada MANAGER voltam ao catálogo original. Todos precisam fazer login novamente.

## Comandos disponíveis (em `backend/`)

| Comando | O que faz |
|---|---|
| `npm start` | Inicia a API |
| `npm run dev` | Inicia a API e reinicia a cada alteração (nodemon) |
| `npm run seed` | Popula o banco com os dados do jogo e cria o ADMIN |
| `npm test` | Executa os testes automatizados |

## Segurança (resumo)

- **SQL Injection:** todas as consultas são parametrizadas e ficam concentradas em `src/repositories/`.
- **XSS:** o backend remove `<` e `>` das entradas de texto e o frontend escapa toda saída em HTML.
- **CSRF:** não se aplica, pois o token vai no cabeçalho `Authorization` (não há cookie de sessão).
- **Autenticação:** senhas com **bcrypt**; **JWT** com identificador (`jti`); o **logout revoga o token** no servidor; o perfil vale o que está no banco, nunca o escrito no token.
- **Controle de acesso:** perfis `ADMIN`/`MANAGER` por rota e **isolamento de dados por usuário** (um MANAGER nunca enxerga nem altera os dados de outro).
- **CORS:** restrito a origens conhecidas.
- **Segredos:** somente no `.env`, que não é versionado.

Detalhes, e o teste automatizado que comprova cada proteção, em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

## Documentação

- [`docs/API.md`](docs/API.md): todos os endpoints, com parâmetros, exemplos e códigos de status.
- [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md): camadas, fluxo de uma requisição, modelo de dados, decisões e limitações.

## Sobre os dados do jogo

O arquivo `converter.py` (Trabalho 1) lê `Drivers.csv` e `Teams.csv` e gera o `backend/dados.json`; **não é necessário executá-lo**, pois o `dados.json` já está no repositório.

O `Teams.csv` do jogo **não informa o campeonato de cada equipe**. Essa informação é recuperada pelo `seed.js` a partir da **ordem** das equipes no arquivo: elas vêm em blocos, um por campeonato (10 equipes em cada um dos cinco primeiros e 6 em cada um dos dois últimos). Duas conferências nos dados sustentam essa leitura: dentro de cada tipo de série, a habilidade e o salário médios dos pilotos caem de um bloco para o seguinte, e as 12 equipes de Endurance são exatamente as que têm 6 pilotos. O resultado foi conferido, equipe por equipe, com a tabela de equipes por campeonato do jogo (62 de 62), e o teste `K3` o trava. O campeonato registrado em `dados.json` (sempre `1`) é, por isso, ignorado pelo seed.

## Limitações conhecidas

- O token JWT fica no `localStorage` do navegador (a mitigação é a sanitização e o escape contra XSS).
- Não há limite de tentativas de login (rate limiting).
- Redefinir a senha de um usuário não encerra as sessões que ele já tem abertas; o logout revoga apenas o token usado.
- A listagem de pilotos não é paginada no servidor (são 259 registros e o frontend pagina); a de usuários é paginada.
- O limite de elenco confere a contagem antes de gravar; duas contratações simultâneas na mesma última vaga poderiam, em tese, passar juntas.

## Uso de IA generativa

Este projeto contou com apoio de ferramentas de IA generativa (**Claude**, da Anthropic, e **Gemini**, do Google) para orientação, geração e revisão de código, testes e documentação. O código foi executado e validado com testes automatizados e uso real do sistema. A descrição detalhada do uso consta na seção 13 do relatório técnico.