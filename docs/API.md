# Documentação da API — MM PitWall (Motorsport Manager)

API REST em Node.js/Express com banco MySQL/MariaDB. Todas as respostas são JSON (`application/json`).

- **URL base (desenvolvimento):** `http://localhost:3000`
- **Autenticação:** JWT (HS256) no cabeçalho `Authorization: Bearer <token>`, obtido em `POST /api/auth/login` (validade padrão de 8 h). O **logout revoga o token no servidor**.
- **Perfis:** `ADMIN` e `MANAGER`. Quem não está logado é **visitante** e só consulta.
- **CORS:** o navegador só consegue chamar a API a partir de origens autorizadas: por padrão `localhost`, `127.0.0.1` e `::1` em qualquer porta, ou a lista da variável `CORS_ORIGIN` do `.env`.

> Os exemplos abaixo vêm de execuções reais da API. Listas longas aparecem abreviadas com `...`, e nomes e identificadores são ilustrativos.

## Sumário (23 endpoints)

| Método | URL | Acesso | Descrição |
|---|---|---|---|
| GET | `/api/status` | Público | Verifica se a API está no ar |
| POST | `/api/auth/registrar` | Público | Cria conta (sempre com perfil `MANAGER`) |
| POST | `/api/auth/login` | Público | Autentica e devolve o token JWT |
| POST | `/api/auth/logout` | Autenticado | Encerra a sessão: revoga o token usado |
| GET | `/api/auth/perfil` | Autenticado | Dados do usuário do token |
| GET | `/api/campeonatos` | Público | Lista os campeonatos e o limite de elenco de cada um |
| GET | `/api/equipes` | Público | Lista as equipes oficiais (e a equipe criada pelo `MANAGER` logado) |
| GET | `/api/equipes/minha` | `MANAGER` | Equipe que o usuário comanda, com resumo e elenco |
| POST | `/api/equipes/minha/assumir` | `MANAGER` | Passa a comandar uma equipe oficial |
| POST | `/api/equipes/minha` | `MANAGER` | Cria a própria equipe e já passa a comandá-la |
| PUT | `/api/equipes/minha` | `MANAGER` | Edita a equipe criada pelo usuário (parcial) |
| DELETE | `/api/equipes/minha` | `MANAGER` | Deixa a equipe comandada (a criada é excluída) |
| GET | `/api/pilotos` | Público | Lista pilotos com atributos (o escopo depende do perfil) |
| GET | `/api/pilotos/:id` | Público | Detalha um piloto |
| POST | `/api/pilotos` | `ADMIN`, `MANAGER` | Cadastra piloto |
| PUT | `/api/pilotos/:id` | `ADMIN`, `MANAGER` | Edita piloto (parcial) |
| DELETE | `/api/pilotos/:id` | `ADMIN`, `MANAGER` | Remove piloto |
| POST | `/api/pilotos/restaurar` | `MANAGER` | Descarta as edições e recebe uma cópia nova do catálogo |
| GET | `/api/usuarios` | `ADMIN` | Lista usuários (paginada, com busca e filtro) |
| POST | `/api/usuarios` | `ADMIN` | Cria usuário com o perfil escolhido |
| PUT | `/api/usuarios/:id/perfil` | `ADMIN` | Altera o perfil de um usuário |
| PUT | `/api/usuarios/:id/senha` | `ADMIN` | Redefine a senha de um usuário |
| DELETE | `/api/usuarios/:id` | `ADMIN` | Exclui um usuário e os dados dele |

### Matriz de permissões

| Operação | Visitante | MANAGER | ADMIN |
|---|:-:|:-:|:-:|
| Consultar pilotos, equipes e campeonatos | ✔ | ✔ | ✔ |
| Cadastrar conta | ✔ | ✔ | ✔ |
| Ver o próprio perfil e fazer logout | ✘ | ✔ | ✔ |
| Cadastrar, editar e excluir pilotos | ✘ | ✔ (na sua cópia) | ✔ (no catálogo-modelo) |
| Restaurar a própria cópia do catálogo | ✘ | ✔ | ✘ |
| Comandar uma equipe (assumir, criar, editar, deixar) | ✘ | ✔ | ✘ |
| Gerenciar usuários (listar, criar, perfil, senha, excluir) | ✘ | ✘ | ✔ |

> O perfil `ADMIN` é criado pelo `npm run seed` (variáveis `ADMIN_*` do `.env`) ou por outro `ADMIN` em `POST /api/usuarios`. O cadastro público sempre cria `MANAGER`; um campo `perfil` enviado no corpo é ignorado.

### Escopo dos dados

Os pilotos e as equipes criadas têm um **dono**. A API sempre trabalha dentro do escopo de quem chama:

| Quem chama | Pilotos que enxerga e altera | Equipes que enxerga |
|---|---|---|
| Visitante | O catálogo-modelo (somente leitura) | As 62 equipes oficiais |
| `MANAGER` | **A sua cópia pessoal** (criada no cadastro) | As oficiais e a que ele criou |
| `ADMIN` | O catálogo-modelo (leitura e escrita) | As 62 equipes oficiais |

Um recurso que existe, mas pertence a outro usuário, responde **`404`**, como se não existisse. As alterações do `ADMIN` no catálogo não mudam as cópias que os `MANAGER` já têm.

## Formato das respostas

**Sucesso:** `{ "status": "sucesso", "mensagem"?: "...", "dados"?: ... }`

**Erro:** `{ "status": "erro", "mensagem": "texto legível" }`

**Erro de validação (400):** além da mensagem, traz a lista `erros` com um item por campo inválido:

```json
{
  "status": "erro",
  "mensagem": "Dados inválidos. Corrija os campos indicados.",
  "erros": [
    { "campo": "idade", "mensagem": "Idade deve ser um número inteiro entre 16 e 60." }
  ]
}
```

Detalhes técnicos (`"detalhe": "<mensagem do erro>"`) só aparecem em respostas de erro quando `NODE_ENV=development`. Em produção o cliente recebe apenas a mensagem genérica.

### Códigos de status usados

| Código | Significado |
|---|---|
| 200 | Operação concluída |
| 201 | Recurso criado |
| 400 | Dados inválidos, identificador inválido, regra de negócio não atendida (ex.: equipe completa) ou JSON malformado |
| 401 | Token ausente, inválido, expirado ou revogado; credenciais incorretas |
| 403 | Perfil sem permissão para a operação (ou equipe oficial, que é somente leitura) |
| 404 | Recurso inexistente (ou de outro dono) e rota inexistente |
| 409 | Conflito (e-mail ou nome já cadastrado; já comanda uma equipe; operação proibida sobre a própria conta) |
| 500 | Erro interno do servidor |

Qualquer rota inexistente responde `404` com `{"status":"erro","mensagem":"Rota não encontrada."}`.

### Fluxo de exemplo

```bash
# 1) login: guarda o token
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"carlos@exemplo.com","senha":"Senha1234"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).token")

# 2) usa o token
curl -s http://localhost:3000/api/auth/perfil -H "Authorization: Bearer $TOKEN"     # 200

# 3) logout: a partir daqui o mesmo token não vale mais
curl -s -X POST http://localhost:3000/api/auth/logout -H "Authorization: Bearer $TOKEN"   # 200
curl -s http://localhost:3000/api/auth/perfil -H "Authorization: Bearer $TOKEN"     # 401
```

---

## Sistema

### GET `/api/status`

Acesso: público. Sem parâmetros.

```bash
curl http://localhost:3000/api/status
```

**200**
```json
{ "status": "API operacional", "timestamp": "2026-11-09T23:05:49.098Z" }
```

---

## Autenticação

### POST `/api/auth/registrar`

Acesso: público. Cria um usuário com perfil `MANAGER` e já entrega a ele uma cópia pessoal do catálogo de pilotos.

| Campo (corpo JSON) | Tipo | Regras |
|---|---|---|
| `nome` | texto | obrigatório, 3–60 caracteres, sem `@`; `<`, `>` e caracteres de controle são removidos. Precisa ser único (sem diferenciar maiúsculas) |
| `email` | texto | obrigatório, formato válido, até 120 caracteres (gravado em minúsculas). Precisa ser único |
| `senha` | texto | obrigatória, 8–72 caracteres, com ao menos 1 letra e 1 número |

```bash
curl -X POST http://localhost:3000/api/auth/registrar \
  -H "Content-Type: application/json" \
  -d '{"nome":"carlos.manager","email":"carlos@exemplo.com","senha":"Senha1234"}'
```

**201**
```json
{ "status": "sucesso", "mensagem": "Conta criada com sucesso! Você já pode fazer login." }
```

**409** (nome repetido; para e-mail repetido a mensagem é “Este e-mail já está cadastrado no sistema.”)
```json
{ "status": "erro", "mensagem": "Este nome de usuário já está em uso. Por favor, escolha outro." }
```

**400** (validação; `mensagem` traz o primeiro erro)
```json
{
  "status": "erro",
  "mensagem": "Nome de usuário deve ter entre 3 e 60 caracteres.",
  "erros": [
    { "campo": "nome", "mensagem": "Nome de usuário deve ter entre 3 e 60 caracteres." },
    { "campo": "email", "mensagem": "Informe um e-mail válido (até 120 caracteres)." },
    { "campo": "senha", "mensagem": "A senha deve ter entre 8 e 72 caracteres." }
  ]
}
```

Status possíveis: `201`, `400`, `409`, `500`.

### POST `/api/auth/login`

Acesso: público. Aceita **e-mail ou nome de usuário** no campo `email` (se contiver `@`, busca por e-mail; senão, por nome).

| Campo (corpo JSON) | Tipo | Regras |
|---|---|---|
| `email` | texto | obrigatório, até 120 caracteres (e-mail ou nome de usuário) |
| `senha` | texto | obrigatória, até 128 caracteres |

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"carlos@exemplo.com","senha":"Senha1234"}'
```

**200**
```json
{
  "status": "sucesso",
  "mensagem": "Login realizado com sucesso",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "usuario": { "id": 154, "nome": "carlos.manager", "email": "carlos@exemplo.com", "perfil": "MANAGER" }
}
```

O token carrega `id`, `nome`, `email`, `perfil` e um identificador único (`jti`). Cada login gera um token novo.

**401** (usuário ou senha incorretos: a mesma resposta nos dois casos, para não revelar quais usuários existem)
```json
{ "status": "erro", "mensagem": "Credenciais inválidas." }
```

**400** (campos ausentes ou com tipo errado, ex.: um objeto no lugar do texto)

Status possíveis: `200`, `400`, `401`, `500`.

### POST `/api/auth/logout`

Acesso: autenticado. Sem corpo. **Revoga o token usado na requisição**: a partir daí, qualquer uso dele responde `401`, mesmo antes de expirar. Os demais tokens do mesmo usuário (outro login) continuam válidos.

```bash
curl -X POST http://localhost:3000/api/auth/logout -H "Authorization: Bearer $TOKEN"
```

**200**
```json
{ "status": "sucesso", "mensagem": "Logout realizado com sucesso. Este token não pode mais ser usado." }
```

Reutilizar o token depois do logout:

**401**
```json
{ "status": "erro", "mensagem": "Sessão encerrada. Faça login novamente." }
```

Status possíveis: `200`, `401`, `500`.

### GET `/api/auth/perfil`

Acesso: autenticado. Devolve o usuário do token, lido do **banco** (o perfil atual, não o que está escrito no token).

```bash
curl http://localhost:3000/api/auth/perfil -H "Authorization: Bearer $TOKEN"
```

**200**
```json
{
  "status": "sucesso",
  "dados": { "id": 154, "nome": "carlos.manager", "email": "carlos@exemplo.com", "perfil": "MANAGER" }
}
```

**401** (sem token)
```json
{ "status": "erro", "mensagem": "Token de autenticação não fornecido." }
```

Status possíveis: `200`, `401`.

---

## Campeonatos

### GET `/api/campeonatos`

Acesso: público. Sem parâmetros. Devolve os 7 campeonatos. `elenco_maximo` é o limite de pilotos de uma equipe **criada** nesse campeonato (Endurance: 6; Single Seater e GT: 3).

```bash
curl http://localhost:3000/api/campeonatos
```

**200** (lista abreviada)
```json
{
  "status": "sucesso",
  "dados": [
    { "id": 1, "nome": "World Motorsport Championship", "tipo": "Single Seater", "categoria": "Tier 1", "elenco_maximo": 3 },
    { "id": 6, "nome": "International Endurance Cup (Class A)", "tipo": "Endurance", "categoria": "Tier 1", "elenco_maximo": 6 }
  ]
}
```

Status possíveis: `200`, `500`.

---

## Equipes

### GET `/api/equipes`

Acesso: público, com autenticação opcional. Visitante e `ADMIN` recebem as 62 equipes oficiais. Um `MANAGER` logado recebe também a equipe que ele criou, que vem **primeiro** na lista (`propria: true`). Um token enviado, mas inválido, responde `401` (não vira visitante).

Campos de cada equipe:

| Campo | Descrição |
|---|---|
| `id`, `nome`, `pais` | Identificação |
| `campeonato_id`, `nome_campeonato`, `tipo_campeonato` | Campeonato da equipe |
| `cor_primaria`, `cor_secundaria` | Cores no formato `#rrggbb` |
| `elenco_maximo` | Limite de pilotos da equipe (as oficiais nunca ficam abaixo do elenco com que vieram do jogo) |
| `propria` | `true` se foi criada pelo usuário que consulta |

```bash
curl http://localhost:3000/api/equipes
```

**200** (lista abreviada)
```json
{
  "status": "sucesso",
  "dados": [
    {
      "id": 30,
      "nome": "Archer BMR",
      "pais": "UK",
      "campeonato_id": 3,
      "nome_campeonato": "European Racing Series",
      "tipo_campeonato": "Single Seater",
      "cor_primaria": "#1e222b",
      "cor_secundaria": "#f5f6f8",
      "elenco_maximo": 3,
      "propria": false
    }
  ]
}
```

Status possíveis: `200`, `401`, `500`.

### GET `/api/equipes/minha`

Acesso: `MANAGER`. A equipe que o usuário comanda, com o resumo calculado pelo banco e o elenco (os pilotos **da cópia dele**). `equipe.tipo` é `oficial` ou `criada`.

```bash
curl http://localhost:3000/api/equipes/minha -H "Authorization: Bearer $TOKEN"
```

**200** (elenco abreviado)
```json
{
  "status": "sucesso",
  "dados": {
    "equipe": {
      "id": 1,
      "nome": "Steinmann Motorsport",
      "pais": "Germany",
      "campeonato_id": 1,
      "nome_campeonato": "World Motorsport Championship",
      "tipo_campeonato": "Single Seater",
      "cor_primaria": "#1e222b",
      "cor_secundaria": "#f5f6f8",
      "elenco_maximo": 3,
      "propria": false,
      "tipo": "oficial"
    },
    "resumo": {
      "total_pilotos": 3,
      "folha_salarial": 34220000,
      "media_estrelas": 3.9,
      "media_potencial": 3.9,
      "pilotos_pagantes": 0
    },
    "elenco": [
      { "id": 1282, "nome": "Harry Chapman", "pais": "UK", "idade": 31, "estrelas_atuais": 4.5, "estrelas_potencial": 4.5, "salario_anual": 16440000, "pay_driver": false }
    ]
  }
}
```

**404** (ainda não comanda nenhuma equipe)
```json
{ "status": "erro", "mensagem": "Você ainda não comanda nenhuma equipe." }
```

Status possíveis: `200`, `401`, `403`, `404`, `500`.

### POST `/api/equipes/minha/assumir`

Acesso: `MANAGER`. Passa a comandar uma equipe **oficial**. Nada da equipe compartilhada é alterado: o elenco vive na cópia de pilotos do próprio usuário, então dois `MANAGER` podem comandar a mesma equipe sem se afetar.

| Campo (corpo JSON) | Tipo | Regras |
|---|---|---|
| `equipe_id` | inteiro | obrigatório, inteiro positivo, de uma equipe **oficial** |

```bash
curl -X POST http://localhost:3000/api/equipes/minha/assumir \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"equipe_id":1}'
```

**201**
```json
{
  "status": "sucesso",
  "mensagem": "Você agora comanda Steinmann Motorsport.",
  "dados": {
    "id": 1, "nome": "Steinmann Motorsport", "pais": "Germany", "campeonato_id": 1,
    "nome_campeonato": "World Motorsport Championship", "tipo_campeonato": "Single Seater",
    "cor_primaria": "#1e222b", "cor_secundaria": "#f5f6f8", "elenco_maximo": 3, "propria": false, "tipo": "oficial"
  }
}
```

**409** (já comanda uma equipe: é preciso deixar a atual antes)
```json
{ "status": "erro", "mensagem": "Você já comanda uma equipe. Deixe a atual antes de assumir ou criar outra." }
```

**404** (equipe inexistente, ou criada por outro usuário). **400** (`equipe_id` ausente ou não inteiro).

Status possíveis: `201`, `400`, `401`, `403`, `404`, `409`, `500`.

### POST `/api/equipes/minha`

Acesso: `MANAGER`. Cria a própria equipe e já passa a comandá-la. Cada `MANAGER` tem no máximo uma equipe criada, e o campeonato escolhido define o limite do elenco.

| Campo (corpo JSON) | Tipo | Regras |
|---|---|---|
| `nome` | texto | obrigatório, 2–80 caracteres (`<` e `>` removidos). Não pode repetir o nome de uma equipe oficial |
| `pais` | texto | obrigatório, 2–60 caracteres |
| `campeonato_id` | inteiro | obrigatório, de um campeonato existente |
| `cor_primaria` | texto | opcional, formato `#rrggbb` (padrão `#383e4d`) |
| `cor_secundaria` | texto | opcional, formato `#rrggbb` (padrão `#ffffff`) |

```bash
curl -X POST http://localhost:3000/api/equipes/minha \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"nome":"Escuderia Sorocaba","pais":"Brasil","campeonato_id":6,"cor_primaria":"#cc0000","cor_secundaria":"#ffffff"}'
```

**201**
```json
{
  "status": "sucesso",
  "mensagem": "Equipe criada com sucesso.",
  "dados": {
    "id": 63, "nome": "Escuderia Sorocaba", "pais": "Brasil", "campeonato_id": 6,
    "nome_campeonato": "International Endurance Cup (Class A)", "tipo_campeonato": "Endurance",
    "cor_primaria": "#cc0000", "cor_secundaria": "#ffffff", "elenco_maximo": 6, "propria": true, "tipo": "criada"
  }
}
```

**400** (validação)
```json
{
  "status": "erro",
  "mensagem": "Dados inválidos. Corrija os campos indicados.",
  "erros": [
    { "campo": "nome", "mensagem": "Nome da equipe deve ter entre 2 e 80 caracteres." },
    { "campo": "campeonato_id", "mensagem": "O campeonato informado não existe." },
    { "campo": "cor_primaria", "mensagem": "Cor primária deve estar no formato #rrggbb." }
  ]
}
```

**409** (já comanda uma equipe, ou o nome é igual ao de uma equipe oficial).

Status possíveis: `201`, `400`, `401`, `403`, `409`, `500`.

### PUT `/api/equipes/minha`

Acesso: `MANAGER`. Edita a equipe **criada pelo usuário**; campos omitidos mantêm o valor atual. As regras dos campos são as mesmas do `POST`.

```bash
curl -X PUT http://localhost:3000/api/equipes/minha \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"cor_primaria":"#0044cc"}'
```

**200**: devolve a equipe atualizada, no mesmo formato do `POST`.

**403** (a equipe comandada é oficial: é compartilhada e somente leitura)
```json
{ "status": "erro", "mensagem": "Equipes oficiais são compartilhadas e não podem ser editadas. Você pode contratar e dispensar pilotos." }
```

**400** também quando a mudança de campeonato reduz o limite abaixo do elenco atual (ex.: “Esse campeonato permite até 3 pilotos e a sua equipe tem 5. Dispense pilotos antes de mudar.”).

Status possíveis: `200`, `400`, `401`, `403`, `404`, `409`, `500`.

### DELETE `/api/equipes/minha`

Acesso: `MANAGER`. Deixa a equipe que comanda. Se for **oficial**, apenas deixa de comandá-la (o elenco continua como está). Se for a **criada pelo usuário**, ela é excluída e os pilotos dela voltam a ser agentes livres.

```bash
curl -X DELETE http://localhost:3000/api/equipes/minha -H "Authorization: Bearer $TOKEN"
```

**200** (equipe oficial)
```json
{ "status": "sucesso", "mensagem": "Você deixou de comandar Steinmann Motorsport.", "dados": { "tipo": "oficial", "pilotos_liberados": 0 } }
```

**200** (equipe criada)
```json
{ "status": "sucesso", "mensagem": "Equipe excluída. Os pilotos dela voltaram a ser agentes livres.", "dados": { "tipo": "criada", "pilotos_liberados": 4 } }
```

Status possíveis: `200`, `401`, `403`, `404`, `500`.

---

## Pilotos

### Objeto piloto

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | inteiro | Identificador |
| `nome`, `pais` | texto | Nome e país de origem |
| `idade` | inteiro | 16 a 60 |
| `series_preference` | texto | `Any`, `Single Seater`, `GT` ou `Endurance` |
| `pay_driver` | booleano | Piloto que traz aporte financeiro |
| `marketability` | texto | Apelo comercial, ex.: `"46%"` |
| `status_contrato` | texto | `Contratado`, `Disponivel` ou `Em Negociacao` (sempre coerente com a equipe) |
| `equipe_id`, `nome_equipe`, `cor_primaria`, `cor_secundaria` | inteiro/texto ou `null` | Equipe atual (`null` para agente livre) |
| `salario_anual` | número | Salário anual |
| `estrelas_atuais`, `estrelas_potencial` | número | 0 a 5; o potencial nunca é menor que o atual |
| `overrall` | inteiro | 0 a 100 (`estrelas_atuais × 20`), coluna gerada pelo banco |
| `atributos` | objeto | 9 inteiros de 0 a 20: `frenagem`, `curva`, `suavidade`, `ultrapassagem`, `consistencia`, `adaptabilidade`, `preparo_fisico`, `feedback`, `foco` |

### GET `/api/pilotos`

Acesso: público, com autenticação opcional. Devolve **todos** os pilotos do escopo de quem chama (a paginação do catálogo é feita pelo frontend): o visitante e o `ADMIN` recebem o catálogo-modelo e o `MANAGER` recebe a sua cópia pessoal. Um token enviado, mas inválido ou revogado, responde `401` (não vira visitante).

```bash
curl http://localhost:3000/api/pilotos
```

**200** (lista abreviada)
```json
{
  "status": "sucesso",
  "dados": [
    {
      "id": 158,
      "nome": "Abasin Dhillon",
      "pais": "Pakistan",
      "idade": 28,
      "series_preference": "Endurance",
      "pay_driver": false,
      "marketability": "46%",
      "status_contrato": "Contratado",
      "equipe_id": 52,
      "nome_equipe": "Shimizu Boom",
      "cor_primaria": "#1e222b",
      "cor_secundaria": "#f5f6f8",
      "salario_anual": 5690000,
      "estrelas_atuais": 4,
      "estrelas_potencial": 4,
      "overrall": 80,
      "atributos": {
        "frenagem": 17, "curva": 14, "suavidade": 19, "ultrapassagem": 9, "consistencia": 16,
        "adaptabilidade": 17, "preparo_fisico": 18, "feedback": 16, "foco": 19
      }
    }
  ]
}
```

Status possíveis: `200`, `401`, `500`.

### GET `/api/pilotos/:id`

Acesso: público, com autenticação opcional, no mesmo escopo da listagem.

| Parâmetro | Onde | Regras |
|---|---|---|
| `id` | URL | inteiro positivo |

```bash
curl http://localhost:3000/api/pilotos/158
```

**200**: `{ "status": "sucesso", "dados": { ...objeto piloto... } }`

**404**
```json
{ "status": "erro", "mensagem": "Piloto não encontrado." }
```

**400** (`id` não numérico)
```json
{ "status": "erro", "mensagem": "Identificador de piloto inválido." }
```

Status possíveis: `200`, `400`, `401`, `404`, `500`.

### POST `/api/pilotos`

Acesso: `ADMIN` (cria no catálogo-modelo) e `MANAGER` (cria na sua cópia).

| Campo (corpo JSON) | Tipo | Regras |
|---|---|---|
| `nome` | texto | obrigatório, 2–100 caracteres (`<` e `>` removidos) |
| `pais` | texto | obrigatório, 2–60 caracteres |
| `idade` | inteiro | obrigatório, 16–60 |
| `salario_anual` | número | obrigatório, de 0 a 9.999.999.999,99 |
| `atributos` | objeto | obrigatório, com os 9 atributos, cada um inteiro de 0 a 20 |
| `equipe_id` | inteiro ou `null` | opcional. A equipe precisa ser visível ao usuário (oficial ou a própria) e **ter vaga**; senão `400` |
| `series_preference` | texto | opcional (`Any`, `Single Seater`, `GT`, `Endurance`; padrão `Any`) |
| `pay_driver` | booleano | opcional (padrão `false`) |
| `marketability` | inteiro | opcional, 0–100 (padrão 0) |
| `estrelas_potencial` | número | opcional, 0–5. Sem ele, o potencial é calculado a partir das estrelas atuais |
| `status_contrato` | texto | opcional; é sempre ajustado à equipe (sem equipe: `Disponivel`; com equipe: `Contratado`, ou `Em Negociacao` se enviado assim) |

As **estrelas atuais** são calculadas pela média dos 9 atributos (escala 0–20 convertida para 0,5–5,0).

```bash
curl -X POST http://localhost:3000/api/pilotos \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"nome":"Lucas Mendes","pais":"Brasil","idade":24,"salario_anual":1500000,"marketability":40,
       "atributos":{"frenagem":12,"curva":13,"suavidade":11,"ultrapassagem":10,"consistencia":12,
                    "adaptabilidade":11,"preparo_fisico":12,"feedback":10,"foco":13}}'
```

**201**
```json
{
  "status": "sucesso",
  "mensagem": "Piloto criado com sucesso.",
  "dados": {
    "id": 1793, "nome": "Lucas Mendes", "pais": "Brasil", "idade": 24, "series_preference": "Any",
    "pay_driver": false, "marketability": "40%", "status_contrato": "Disponivel",
    "equipe_id": null, "nome_equipe": null, "cor_primaria": null, "cor_secundaria": null,
    "salario_anual": 1500000, "estrelas_atuais": 2.9, "estrelas_potencial": 3.4, "overrall": 58,
    "atributos": { "frenagem": 12, "curva": 13, "suavidade": 11, "ultrapassagem": 10, "consistencia": 12,
                   "adaptabilidade": 11, "preparo_fisico": 12, "feedback": 10, "foco": 13 }
  }
}
```

**400** (validação)
```json
{
  "status": "erro",
  "mensagem": "Dados inválidos. Corrija os campos indicados.",
  "erros": [
    { "campo": "idade", "mensagem": "Idade deve ser um número inteiro entre 16 e 60." },
    { "campo": "atributos.curva", "mensagem": "Curva deve ser um inteiro entre 0 e 20." }
  ]
}
```

**400** (equipe cheia)
```json
{
  "status": "erro",
  "mensagem": "Dados inválidos. Corrija os campos indicados.",
  "erros": [
    { "campo": "equipe_id", "mensagem": "A equipe Steinmann Motorsport está completa (3 de 3 pilotos). Dispense um piloto antes de contratar outro." }
  ]
}
```

**401** (sem token): `{ "status": "erro", "mensagem": "Token de autenticação não fornecido." }`

Status possíveis: `201`, `400`, `401`, `500`.

### PUT `/api/pilotos/:id`

Acesso: `ADMIN` e `MANAGER`, cada um no seu escopo. **Atualização parcial**: campos omitidos mantêm o valor atual, e `atributos` é mesclado atributo por atributo. As regras dos campos são as do `POST`. As estrelas atuais só são recalculadas quando algum atributo muda, o que preserva os valores originais do jogo ao editar apenas salário, equipe etc. O limite de elenco só vale ao **entrar** numa equipe.

```bash
curl -X PUT http://localhost:3000/api/pilotos/1793 \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"salario_anual":1800000,"atributos":{"curva":15}}'
```

**200**: devolve o piloto atualizado, no mesmo formato do `POST`, com a mensagem “Piloto atualizado com sucesso.”

**404** (piloto inexistente ou de outro dono). **400** (validação, equipe inexistente ou completa, ou `id` inválido).

Status possíveis: `200`, `400`, `401`, `404`, `500`.

### DELETE `/api/pilotos/:id`

Acesso: `ADMIN` e `MANAGER`, cada um no seu escopo. A remoção é definitiva.

```bash
curl -X DELETE http://localhost:3000/api/pilotos/1793 -H "Authorization: Bearer $TOKEN"
```

**200**
```json
{ "status": "sucesso", "mensagem": "Registro do piloto removido definitivamente." }
```

**404** (piloto inexistente, de outro dono, ou já removido). **400** (`id` inválido).

Status possíveis: `200`, `400`, `401`, `404`, `500`.

### POST `/api/pilotos/restaurar`

Acesso: `MANAGER`. Sem corpo. Em uma única transação, descarta a cópia pessoal de pilotos, a equipe criada pelo usuário e a equipe que ele comandava, e entrega uma cópia nova do catálogo-modelo. Não afeta nenhum outro usuário.

```bash
curl -X POST http://localhost:3000/api/pilotos/restaurar -H "Authorization: Bearer $TOKEN"
```

**200**
```json
{ "status": "sucesso", "mensagem": "Seus dados foram restaurados a partir do catálogo-modelo.", "dados": { "total": 259 } }
```

Status possíveis: `200`, `401`, `403`, `500`.

---

## Usuários

Todas as rotas desta seção são exclusivas do perfil `ADMIN`. Um `MANAGER` recebe `403` e um visitante recebe `401`.

### Objeto usuário

| Campo | Descrição |
|---|---|
| `id`, `nome`, `email`, `perfil` | Identificação e perfil (`ADMIN` ou `MANAGER`) |
| `criado_em` | Data de criação |
| `total_pilotos` | Quantidade de pilotos da cópia pessoal do usuário (0 para `ADMIN`) |
| `equipe_criada` | Nome da equipe criada por ele, ou `null` |
| `equipe_comandada` | Nome da equipe que ele comanda, ou `null` |

A hash da senha **nunca** é devolvida.

### GET `/api/usuarios`

Lista paginada, ordenada por perfil e nome.

| Parâmetro (query) | Tipo | Regras |
|---|---|---|
| `pagina` | inteiro | opcional, ≥ 1 (padrão 1) |
| `limite` | inteiro | opcional, de 1 a 50 (padrão 10) |
| `busca` | texto | opcional, até 60 caracteres; procura no nome ou no e-mail. Os curingas `%` e `_` valem como texto comum |
| `perfil` | texto | opcional: `ADMIN` ou `MANAGER` |

```bash
curl "http://localhost:3000/api/usuarios?limite=2&busca=carlos&perfil=MANAGER" -H "Authorization: Bearer $TOKEN_ADMIN"
```

**200**
```json
{
  "status": "sucesso",
  "dados": [
    {
      "id": 154, "nome": "carlos.manager", "email": "carlos@exemplo.com", "perfil": "MANAGER",
      "criado_em": "2026-11-09T23:05:49.000Z", "total_pilotos": 259, "equipe_criada": null, "equipe_comandada": null
    }
  ],
  "paginacao": { "pagina": 1, "limite": 2, "total": 1, "total_paginas": 1 }
}
```

**400** (parâmetro inválido, ex.: `limite=51`).

Status possíveis: `200`, `400`, `401`, `403`, `500`.

### POST `/api/usuarios`

Cria um usuário com o perfil escolhido. Um `MANAGER` já nasce com a sua cópia do catálogo; um `ADMIN` não recebe cópia.

| Campo (corpo JSON) | Tipo | Regras |
|---|---|---|
| `nome` | texto | as mesmas do cadastro público |
| `email` | texto | as mesmas do cadastro público |
| `senha` | texto | as mesmas do cadastro público (8–72 caracteres, com letra e número) |
| `perfil` | texto | obrigatório: `ADMIN` ou `MANAGER` |

```bash
curl -X POST http://localhost:3000/api/usuarios \
  -H "Authorization: Bearer $TOKEN_ADMIN" -H "Content-Type: application/json" \
  -d '{"nome":"ana.silva","email":"ana@exemplo.com","senha":"Senha1234","perfil":"MANAGER"}'
```

**201**
```json
{
  "status": "sucesso",
  "mensagem": "Usuário criado com sucesso.",
  "dados": {
    "id": 155, "nome": "ana.silva", "email": "ana@exemplo.com", "perfil": "MANAGER",
    "criado_em": "2026-11-09T23:05:49.000Z", "total_pilotos": 259, "equipe_criada": null, "equipe_comandada": null
  }
}
```

**409**
```json
{ "status": "erro", "mensagem": "Este nome de usuário já está em uso." }
```

**400** (validação: senha fraca, perfil inválido etc.).

Status possíveis: `201`, `400`, `401`, `403`, `409`, `500`.

### PUT `/api/usuarios/:id/perfil`

Altera o perfil de um usuário:

- **MANAGER → ADMIN:** os dados pessoais dele (cópia de pilotos, equipe criada e equipe comandada) são **apagados**.
- **ADMIN → MANAGER:** ele recebe uma **cópia nova** do catálogo.
- O token do usuário passa a valer com o novo perfil imediatamente (o perfil é lido do banco a cada requisição).
- O `ADMIN` **não altera o próprio perfil** (`409`): isso garante que sempre reste ao menos um `ADMIN`.

| Campo (corpo JSON) | Tipo | Regras |
|---|---|---|
| `perfil` | texto | obrigatório: `ADMIN` ou `MANAGER` |

```bash
curl -X PUT http://localhost:3000/api/usuarios/155/perfil \
  -H "Authorization: Bearer $TOKEN_ADMIN" -H "Content-Type: application/json" \
  -d '{"perfil":"ADMIN"}'
```

**200**: devolve o objeto usuário atualizado, com a mensagem “Perfil atualizado com sucesso.”

**409**
```json
{ "status": "erro", "mensagem": "Você não pode alterar o seu próprio perfil." }
```

**404** (usuário inexistente). **400** (`id` ou `perfil` inválido).

Status possíveis: `200`, `400`, `401`, `403`, `404`, `409`, `500`.

### PUT `/api/usuarios/:id/senha`

Redefine a senha de um usuário. A senha não é registrada em log nem devolvida. As sessões que o usuário já tem abertas continuam válidas até expirarem.

| Campo (corpo JSON) | Tipo | Regras |
|---|---|---|
| `senha` | texto | obrigatória, 8–72 caracteres, com ao menos 1 letra e 1 número |

```bash
curl -X PUT http://localhost:3000/api/usuarios/155/senha \
  -H "Authorization: Bearer $TOKEN_ADMIN" -H "Content-Type: application/json" \
  -d '{"senha":"NovaSenha789"}'
```

**200**
```json
{ "status": "sucesso", "mensagem": "Senha redefinida com sucesso." }
```

**404** (usuário inexistente). **400** (senha fraca ou `id` inválido).

Status possíveis: `200`, `400`, `401`, `403`, `404`, `500`.

### DELETE `/api/usuarios/:id`

Exclui o usuário e, em cascata, a cópia de pilotos, a equipe criada por ele e as ligações com a equipe comandada. O `ADMIN` **não exclui a própria conta** (`409`). A resposta informa o que saiu junto.

```bash
curl -X DELETE http://localhost:3000/api/usuarios/155 -H "Authorization: Bearer $TOKEN_ADMIN"
```

**200**
```json
{
  "status": "sucesso",
  "mensagem": "Usuário excluído com sucesso.",
  "dados": { "pilotos_removidos": 259, "equipe_removida": "Escuderia Sorocaba" }
}
```

**409**
```json
{ "status": "erro", "mensagem": "Você não pode excluir a sua própria conta." }
```

**404** (usuário inexistente). **400** (`id` inválido).

Status possíveis: `200`, `400`, `401`, `403`, `404`, `409`, `500`.

---

## Erros transversais

**Token ausente (401)**
```json
{ "status": "erro", "mensagem": "Token de autenticação não fornecido." }
```

**Token adulterado, expirado, assinado com outro segredo ou sem identificador (401)**
```json
{ "status": "erro", "mensagem": "Token inválido ou expirado." }
```

**Token revogado pelo logout (401)**
```json
{ "status": "erro", "mensagem": "Sessão encerrada. Faça login novamente." }
```

**Usuário do token foi excluído (401)**
```json
{ "status": "erro", "mensagem": "Sessão inválida: o usuário não existe mais. Faça login novamente." }
```

**Perfil sem permissão (403)**
```json
{ "status": "erro", "mensagem": "Acesso proibido. Seu perfil não possui permissão para esta operação." }
```

**Rota inexistente (404)**
```json
{ "status": "erro", "mensagem": "Rota não encontrada." }
```

**JSON malformado no corpo (400)**
```json
{ "status": "erro", "mensagem": "JSON inválido no corpo da requisição." }
```
(com `NODE_ENV=development` inclui também `"detalhe"`).

## Logs

Eventos relevantes são gravados em `backend/logs/app.log`, um por linha, com timestamp ISO 8601: login com sucesso, falha de autenticação, acesso negado (401 e 403, inclusive token revogado), logout, cadastro de usuário, criação, edição e exclusão de pilotos e equipes, gestão de usuários pelo `ADMIN` e erros internos. Senhas nunca são registradas, e quebras de linha em dados enviados pelo usuário são neutralizadas para impedir a forja de linhas no log.