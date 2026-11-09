# Documentação da API — Motorsport Manager

API REST em Node.js/Express com banco MySQL. Todas as respostas são JSON (`application/json`).

- **URL base (desenvolvimento):** `http://localhost:3000`
- **Autenticação:** JWT no cabeçalho `Authorization: Bearer <token>` (obtido em `POST /api/auth/login`, validade padrão de 8 h).
- **Perfis:** `ADMIN` e `MANAGER`. Visitantes (sem login) só consultam.

## Sumário

| Método | URL | Acesso | Descrição |
|---|---|---|---|
| GET | `/api/status` | Público | Verifica se a API está no ar |
| POST | `/api/auth/registrar` | Público | Cria conta (sempre com perfil `MANAGER`) |
| POST | `/api/auth/login` | Público | Autentica e devolve o token JWT |
| POST | `/api/auth/logout` | Autenticado | Registra o logout (cliente descarta o token) |
| GET | `/api/auth/perfil` | Autenticado | Dados do usuário do token |
| GET | `/api/equipes` | Público | Lista equipes |
| GET | `/api/pilotos` | Público | Lista pilotos com atributos |
| GET | `/api/pilotos/:id` | Público | Detalha um piloto |
| POST | `/api/pilotos` | `ADMIN`, `MANAGER` | Cadastra piloto |
| PUT | `/api/pilotos/:id` | `ADMIN`, `MANAGER` | Edita piloto (parcial) |
| DELETE | `/api/pilotos/:id` | `ADMIN`, `MANAGER` | Remove piloto |

### Matriz de permissões

| Operação | Visitante | MANAGER | ADMIN |
|---|:-:|:-:|:-:|
| Consultar pilotos e equipes | ✔ | ✔ | ✔ |
| Cadastrar conta | ✔ | ✔ | ✔ |
| Ver o próprio perfil / logout | ✘ | ✔ | ✔ |
| Cadastrar piloto | ✘ | ✔ | ✔ |
| Editar piloto | ✘ | ✔ | ✔ |
| Excluir piloto | ✘ | ✔ | ✔ |

> O perfil `ADMIN` só é criado pelo `npm run seed` (variáveis `ADMIN_*` do `.env`). O cadastro público sempre cria `MANAGER`; um campo `perfil` enviado no corpo é ignorado.

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
| 400 | Dados inválidos, identificador inválido ou JSON malformado |
| 401 | Token ausente, inválido ou expirado; credenciais incorretas |
| 403 | Perfil sem permissão para a operação |
| 404 | Recurso ou rota inexistente |
| 409 | Conflito (e-mail ou nome de usuário já cadastrado) |
| 500 | Erro interno do servidor |

Qualquer rota inexistente responde `404` com `{"status":"erro","mensagem":"Rota não encontrada."}`.

---

## Sistema

### GET `/api/status`

Acesso: público. Sem parâmetros.

```bash
curl http://localhost:3000/api/status
```

**200**
```json
{ "status": "API operacional", "timestamp": "2026-11-08T15:41:08.731Z" }
```

---

## Autenticação

### POST `/api/auth/registrar`

Acesso: público. Cria um usuário com perfil `MANAGER`.

| Campo (corpo JSON) | Tipo | Regras |
|---|---|---|
| `nome` | texto | obrigatório, 3–60 caracteres, sem `@`; `<`, `>` e caracteres de controle são removidos |
| `email` | texto | obrigatório, formato válido, até 120 caracteres (gravado em minúsculas) |
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

**409** (e-mail já cadastrado; para nome repetido a mensagem é “Este nome de usuário já está em uso…”)
```json
{ "status": "erro", "mensagem": "Este e-mail já está cadastrado no sistema." }
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
  -d '{"email":"admin@exemplo.com","senha":"SuaSenha123"}'
```

**200**
```json
{
  "status": "sucesso",
  "mensagem": "Login realizado com sucesso",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....",
  "usuario": { "id": 4, "nome": "Administrador", "email": "admin@exemplo.com", "perfil": "ADMIN" }
}
```

**401** (e-mail inexistente ou senha errada: a mesma resposta nos dois casos)
```json
{ "status": "erro", "mensagem": "Credenciais inválidas." }
```

**400**
```json
{
  "status": "erro",
  "mensagem": "Informe o e-mail ou nome de usuário (até 120 caracteres).",
  "erros": [{ "campo": "email", "mensagem": "Informe o e-mail ou nome de usuário (até 120 caracteres)." }]
}
```

Status possíveis: `200`, `400`, `401`, `500`.

### POST `/api/auth/logout`

Acesso: autenticado. Sem corpo. Como o JWT é *stateless*, o servidor registra o evento no log e o **cliente deve descartar o token**.

```bash
curl -X POST http://localhost:3000/api/auth/logout -H "Authorization: Bearer $TOKEN"
```

**200**
```json
{ "status": "sucesso", "mensagem": "Logout realizado com sucesso. Descarte o token no cliente." }
```

**401** `{ "status": "erro", "mensagem": "Token de autenticação não fornecido." }`

Status possíveis: `200`, `401`.

### GET `/api/auth/perfil`

Acesso: autenticado. Devolve os dados contidos no token.

```bash
curl http://localhost:3000/api/auth/perfil -H "Authorization: Bearer $TOKEN"
```

**200**
```json
{ "status": "sucesso", "dados": { "id": 4, "nome": "Administrador", "email": "admin@exemplo.com", "perfil": "ADMIN" } }
```

**401** `{ "status": "erro", "mensagem": "Token inválido ou expirado." }` (também `"Token de autenticação não fornecido."` quando o cabeçalho falta)

Status possíveis: `200`, `401`.

---

## Equipes

### GET `/api/equipes`

Acesso: público. Sem parâmetros. Ordenadas por nome.

```bash
curl http://localhost:3000/api/equipes
```

**200** (lista abreviada)
```json
{
  "status": "sucesso",
  "dados": [
    {
      "id": 30, "nome": "Archer BMR", "pais": "UK",
      "campeonato_id": 1, "nome_campeonato": "World Motorsport Championship",
      "cor_primaria": "#1e222b", "cor_secundaria": "#f5f6f8"
    }
  ]
}
```

Status possíveis: `200`, `500`.

---

## Pilotos

### Objeto piloto (resposta)

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | inteiro | Identificador |
| `nome`, `pais` | texto | Nome e nacionalidade |
| `idade` | inteiro | 16–60 |
| `salario_anual` | número | Em dólares |
| `series_preference` | texto | `Any`, `Single Seater`, `GT` ou `Endurance` |
| `pay_driver` | booleano | Piloto pagante |
| `marketability` | texto | Apelo comercial, ex.: `"60%"` (na **entrada** é o inteiro `60`) |
| `status_contrato` | texto | `Contratado`, `Disponivel` ou `Em Negociacao` (derivado da equipe) |
| `equipe_id`, `nome_equipe`, `cor_primaria`, `cor_secundaria` | — | Equipe atual (`null` se agente livre) |
| `atributos` | objeto | 9 atributos inteiros de 0 a 20: `frenagem`, `curva`, `suavidade`, `ultrapassagem`, `consistencia`, `adaptabilidade`, `preparo_fisico`, `feedback`, `foco` |
| `estrelas_atuais` | número | 0.5–5.0 (recalculadas pela média dos atributos quando algum muda) |
| `estrelas_potencial` | número | 0–5, nunca menor que as atuais |
| `overrall` | inteiro | 0–100, derivado das estrelas atuais (somente leitura) |

### GET `/api/pilotos`

Acesso: público. Sem parâmetros. Ordenados por nome. Devolve todos os pilotos (o frontend faz filtro, busca e paginação).

```bash
curl http://localhost:3000/api/pilotos
```

**200** (lista abreviada)
```json
{
  "status": "sucesso",
  "dados": [
    {
      "id": 1, "nome": "Harry Chapman", "pais": "UK", "idade": 31,
      "series_preference": "Single Seater", "pay_driver": false, "marketability": "100%",
      "status_contrato": "Contratado", "equipe_id": 1, "nome_equipe": "Steinmann Motorsport",
      "cor_primaria": "#1e222b", "cor_secundaria": "#f5f6f8",
      "salario_anual": 16440000, "estrelas_atuais": 4.5, "estrelas_potencial": 4.5, "overrall": 90,
      "atributos": {
        "frenagem": 19, "curva": 19, "suavidade": 17, "ultrapassagem": 19, "consistencia": 19,
        "adaptabilidade": 17, "preparo_fisico": 17, "feedback": 17, "foco": 18
      }
    }
  ]
}
```

Status possíveis: `200`, `500`.

### GET `/api/pilotos/:id`

Acesso: público.

| Parâmetro | Local | Regra |
|---|---|---|
| `id` | URL | inteiro positivo |

```bash
curl http://localhost:3000/api/pilotos/1
```

**200** → `{ "status": "sucesso", "dados": { ...objeto piloto... } }`

**404** `{ "status": "erro", "mensagem": "Piloto não encontrado." }`

**400** `{ "status": "erro", "mensagem": "Identificador de piloto inválido." }` (ex.: `/api/pilotos/abc`)

Status possíveis: `200`, `400`, `404`, `500`.

### POST `/api/pilotos`

Acesso: `ADMIN`, `MANAGER`. Corpo JSON:

| Campo | Tipo | Obrigatório | Regras |
|---|---|:-:|---|
| `nome` | texto | sim | 2–100 caracteres; `<`, `>` e controle removidos |
| `pais` | texto | sim | 2–60 caracteres |
| `idade` | inteiro | sim | 16–60 |
| `salario_anual` | número | sim | 0 a 9.999.999.999,99 |
| `atributos` | objeto | sim | os 9 atributos, inteiros de 0 a 20 |
| `equipe_id` | inteiro ou `null` | não | equipe existente; `null` = agente livre |
| `series_preference` | texto | não | `Any` (padrão), `Single Seater`, `GT`, `Endurance` |
| `pay_driver` | booleano | não | padrão `false` |
| `marketability` | inteiro | não | 0–100, padrão `0` |
| `estrelas_potencial` | número | não | 0–5; padrão = atuais + 0,5 (máx. 5) |

`estrelas_atuais`, `overrall` e `status_contrato` são calculados pelo servidor.

```bash
curl -X POST http://localhost:3000/api/pilotos \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"nome":"Lucas Mendes","pais":"Brasil","idade":24,"salario_anual":1500000,"equipe_id":1,
       "series_preference":"Single Seater","pay_driver":false,"marketability":60,
       "atributos":{"frenagem":14,"curva":15,"suavidade":13,"ultrapassagem":12,"consistencia":16,
                    "adaptabilidade":11,"preparo_fisico":14,"feedback":13,"foco":15}}'
```

**201**
```json
{
  "status": "sucesso",
  "mensagem": "Piloto criado com sucesso.",
  "dados": {
    "id": 284, "nome": "Lucas Mendes", "pais": "Brasil", "idade": 24,
    "series_preference": "Single Seater", "pay_driver": false, "marketability": "60%",
    "status_contrato": "Contratado", "equipe_id": 1, "nome_equipe": "Steinmann Motorsport",
    "cor_primaria": "#1e222b", "cor_secundaria": "#f5f6f8",
    "salario_anual": 1500000, "estrelas_atuais": 3.4, "estrelas_potencial": 3.9, "overrall": 68,
    "atributos": {
      "frenagem": 14, "curva": 15, "suavidade": 13, "ultrapassagem": 12, "consistencia": 16,
      "adaptabilidade": 11, "preparo_fisico": 14, "feedback": 13, "foco": 15
    }
  }
}
```

**400** (validação)
```json
{
  "status": "erro",
  "mensagem": "Dados inválidos. Corrija os campos indicados.",
  "erros": [
    { "campo": "nome", "mensagem": "Nome deve ter entre 2 e 100 caracteres." },
    { "campo": "idade", "mensagem": "Idade deve ser um número inteiro entre 16 e 60." },
    { "campo": "atributos.frenagem", "mensagem": "Frenagem deve ser um inteiro entre 0 e 20." }
  ]
}
```

**401** sem token / token inválido · **403** `{ "status": "erro", "mensagem": "Acesso proibido. Seu perfil não possui permissão para esta operação." }`

Status possíveis: `201`, `400`, `401`, `403`, `500`.

### PUT `/api/pilotos/:id`

Acesso: `ADMIN`, `MANAGER`. **Edição parcial:** campos omitidos mantêm o valor atual; em `atributos` basta enviar os que mudam. Aceita os mesmos campos e regras do POST, mais `status_contrato` (`Em Negociacao` só vale com equipe definida).

Regras de negócio:
- Se algum atributo muda, `estrelas_atuais` é recalculada (média dos 9 ÷ 20 × 5); se nenhum muda, o valor gravado é preservado.
- `equipe_id: null` torna o piloto agente livre (`status_contrato` = `Disponivel`).
- `estrelas_potencial` nunca fica abaixo das atuais.

```bash
curl -X PUT http://localhost:3000/api/pilotos/284 \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"salario_anual":2000000,"atributos":{"frenagem":18}}'
```

**200**
```json
{
  "status": "sucesso",
  "mensagem": "Piloto atualizado com sucesso.",
  "dados": {
    "id": 284, "nome": "Lucas Mendes", "salario_anual": 2000000,
    "estrelas_atuais": 3.5, "estrelas_potencial": 3.9, "overrall": 70,
    "atributos": { "frenagem": 18, "curva": 15, "...": "demais campos do objeto piloto omitidos" }
  }
}
```

**400** validação (mesmo formato do POST; o registro não é alterado) · **401** · **403** · **404** `{ "status": "erro", "mensagem": "Piloto não encontrado." }`

Status possíveis: `200`, `400`, `401`, `403`, `404`, `500`.

### DELETE `/api/pilotos/:id`

Acesso: `ADMIN`, `MANAGER`. Sem corpo.

```bash
curl -X DELETE http://localhost:3000/api/pilotos/284 -H "Authorization: Bearer $TOKEN"
```

**200**
```json
{ "status": "sucesso", "mensagem": "Registro do piloto removido definitivamente." }
```

**404** `{ "status": "erro", "mensagem": "Piloto não encontrado." }` (também ao repetir a exclusão) · **400** identificador inválido · **401** · **403**

Status possíveis: `200`, `400`, `401`, `403`, `404`, `500`.

---

## Erros transversais

**JSON malformado no corpo (400)**
```json
{ "status": "erro", "mensagem": "JSON inválido no corpo da requisição." }
```
(em desenvolvimento inclui `"detalhe"`).

**Token ausente (401)** `{ "status": "erro", "mensagem": "Token de autenticação não fornecido." }`
**Token adulterado, expirado ou assinado com outro segredo (401)** `{ "status": "erro", "mensagem": "Token inválido ou expirado." }`

## Logs

Eventos relevantes são gravados em `backend/logs/app.log`, um por linha, com timestamp ISO 8601:
login com sucesso, falha de autenticação, acesso negado (401/403), logout, cadastro de usuário, criação/edição/exclusão de piloto e erros internos. Quebras de linha em dados enviados pelo usuário são neutralizadas para impedir a forja de linhas de log.