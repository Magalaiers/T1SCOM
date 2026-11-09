-- =====================================================================
-- Motorsport Manager - script de criação do banco (MySQL 8.0.16+ / MariaDB 10.2+)
--
-- Uso:  mysql -u <usuario> -p < database/schema.sql
-- Depois, popular com os dados do Trabalho 1:  cd backend && npm run seed
--
-- ATENÇÃO: as tabelas de domínio (campeonatos, equipes, pilotos) são
-- recriadas a cada execução porque o `seed` as repopula a partir do
-- dados.json. A tabela `usuarios` é preservada (CREATE IF NOT EXISTS).
-- =====================================================================

CREATE DATABASE IF NOT EXISTS motorsport_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE motorsport_db;

DROP TABLE IF EXISTS pilotos;
DROP TABLE IF EXISTS equipes;
DROP TABLE IF EXISTS campeonatos;

-- ---------------------------------------------------------------------
-- Usuários (autenticação e perfis de acesso)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    nome        VARCHAR(100) NOT NULL,
    email       VARCHAR(120) NOT NULL UNIQUE,
    senha_hash  VARCHAR(255) NOT NULL,
    perfil      ENUM('ADMIN', 'MANAGER') NOT NULL DEFAULT 'MANAGER',
    criado_em   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- o login aceita nome de usuário: ele precisa ser único também no banco
    CONSTRAINT uq_usuarios_nome UNIQUE (nome)
);

-- ---------------------------------------------------------------------
-- Tokens JWT revogados pelo logout. Fica junto de `usuarios` e,
-- como ela, é preservada quando este script é executado de novo.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tokens_revogados (
    jti         CHAR(36) NOT NULL,
    usuario_id  INT NOT NULL,
    expira_em   INT UNSIGNED NOT NULL COMMENT 'claim exp do JWT: segundos desde 1970 (independe de fuso horário)',
    revogado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (jti),
    CONSTRAINT fk_tokens_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    INDEX idx_tokens_expira_em (expira_em)
);

-- ---------------------------------------------------------------------
-- Campeonatos
-- ---------------------------------------------------------------------
CREATE TABLE campeonatos (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    nome       VARCHAR(80) NOT NULL UNIQUE,
    tipo       VARCHAR(30) NOT NULL,   -- Single Seater | GT | Endurance
    categoria  VARCHAR(50) NOT NULL    -- Tier 1, Tier 2, ...
);

-- ---------------------------------------------------------------------
-- Equipes
-- ---------------------------------------------------------------------
CREATE TABLE equipes (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    nome            VARCHAR(80) NOT NULL UNIQUE,
    pais            VARCHAR(60) NOT NULL,
    campeonato_id   INT NOT NULL,
    cor_primaria    CHAR(7) NOT NULL DEFAULT '#383e4d',
    cor_secundaria  CHAR(7) NOT NULL DEFAULT '#ffffff',
    CONSTRAINT fk_equipes_campeonato
        FOREIGN KEY (campeonato_id) REFERENCES campeonatos(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

-- ---------------------------------------------------------------------
-- Pilotos (entidade principal)
--
-- `dono_id` define de quem é o registro:
--   NULL            = catálogo-modelo (gerido pelo ADMIN; é o que o visitante vê)
--   id de um MANAGER = cópia pessoal desse usuário (criada no cadastro dele)
-- Ao excluir o usuário, as cópias dele são apagadas junto (ON DELETE CASCADE).
--
-- Os 9 atributos técnicos (escala 0-20 do simulador) ficam em colunas
-- próprias: era a ausência delas que fazia a API devolver o piloto sem
-- `atributos` e o frontend exibir o valor-padrão para todos.
-- `overrall` é uma coluna GERADA (0-100) derivada das estrelas atuais,
-- portanto nunca fica inconsistente com elas.
-- ---------------------------------------------------------------------
CREATE TABLE pilotos (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    nome                VARCHAR(100) NOT NULL,
    pais                VARCHAR(60)  NOT NULL,
    idade               TINYINT UNSIGNED NOT NULL,
    salario_anual       DECIMAL(12, 2) NOT NULL DEFAULT 0,
    series_preference   ENUM('Any', 'Single Seater', 'GT', 'Endurance') NOT NULL DEFAULT 'Any',
    pay_driver          BOOLEAN NOT NULL DEFAULT FALSE,
    marketability       TINYINT UNSIGNED NOT NULL DEFAULT 0,
    status_contrato     ENUM('Contratado', 'Disponivel', 'Em Negociacao') NOT NULL DEFAULT 'Disponivel',
    equipe_id           INT NULL,
    dono_id             INT NULL,

    -- Atributos técnicos (0 a 20)
    frenagem            TINYINT UNSIGNED NOT NULL,
    curva               TINYINT UNSIGNED NOT NULL,
    suavidade           TINYINT UNSIGNED NOT NULL,
    ultrapassagem       TINYINT UNSIGNED NOT NULL,
    consistencia        TINYINT UNSIGNED NOT NULL,
    adaptabilidade      TINYINT UNSIGNED NOT NULL,
    preparo_fisico      TINYINT UNSIGNED NOT NULL,
    feedback            TINYINT UNSIGNED NOT NULL,
    foco                TINYINT UNSIGNED NOT NULL,

    estrelas_atuais     DECIMAL(2, 1) NOT NULL,
    estrelas_potencial  DECIMAL(2, 1) NOT NULL,
    overrall            TINYINT UNSIGNED GENERATED ALWAYS AS (ROUND(estrelas_atuais * 20)) STORED,

    criado_em           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_pilotos_equipe
        FOREIGN KEY (equipe_id) REFERENCES equipes(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT fk_pilotos_dono
        FOREIGN KEY (dono_id) REFERENCES usuarios(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT ck_pilotos_idade          CHECK (idade BETWEEN 16 AND 60),
    CONSTRAINT ck_pilotos_salario        CHECK (salario_anual >= 0),
    CONSTRAINT ck_pilotos_marketability  CHECK (marketability BETWEEN 0 AND 100),
    CONSTRAINT ck_pilotos_estrelas       CHECK (estrelas_atuais BETWEEN 0 AND 5
                                                AND estrelas_potencial BETWEEN 0 AND 5
                                                AND estrelas_potencial >= estrelas_atuais),
    CONSTRAINT ck_pilotos_atributos      CHECK (
        frenagem       BETWEEN 0 AND 20 AND curva          BETWEEN 0 AND 20 AND
        suavidade      BETWEEN 0 AND 20 AND ultrapassagem  BETWEEN 0 AND 20 AND
        consistencia   BETWEEN 0 AND 20 AND adaptabilidade BETWEEN 0 AND 20 AND
        preparo_fisico BETWEEN 0 AND 20 AND feedback       BETWEEN 0 AND 20 AND
        foco           BETWEEN 0 AND 20
    )
);

-- ---------------------------------------------------------------------
-- Índices (além dos criados automaticamente por PK, UNIQUE e FK)
-- ---------------------------------------------------------------------
CREATE INDEX idx_pilotos_overrall ON pilotos(overrall);
CREATE INDEX idx_pilotos_nome     ON pilotos(nome);
CREATE INDEX idx_pilotos_status   ON pilotos(status_contrato);

-- Contas iniciais (admin/manager) NÃO ficam neste script: com senha/hash
-- escritos aqui elas viram credenciais versionadas no repositório.
-- O `npm run seed` cria o ADMIN a partir das variáveis do .env.

-- ---------------------------------------------------------------------
-- Atualização de bancos antigos: como `usuarios` é preservada acima (IF NOT EXISTS), uma tabela criada
-- antes desta versão não tem a restrição de nome único. Este bloco a acrescenta só se ainda não existir
-- (no MySQL não há "ADD CONSTRAINT IF NOT EXISTS"), então rodar o script várias vezes é seguro.
-- Se falhar com "Duplicate entry", há nomes repetidos: SELECT nome, COUNT(*) FROM usuarios GROUP BY nome HAVING COUNT(*) > 1;
-- ---------------------------------------------------------------------
SET @ja_existe := (
    SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' AND CONSTRAINT_NAME = 'uq_usuarios_nome'
);
SET @comando := IF(@ja_existe = 0, 'ALTER TABLE usuarios ADD CONSTRAINT uq_usuarios_nome UNIQUE (nome)', 'DO 0');
PREPARE aplicar FROM @comando;
EXECUTE aplicar;
DEALLOCATE PREPARE aplicar;