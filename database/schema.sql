CREATE DATABASE IF NOT EXISTS motorsport_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE motorsport_db;

CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(120) NOT NULL UNIQUE,
    senha_hash VARCHAR(255) NOT NULL,
    perfil ENUM('ADMIN', 'MANAGER') NOT NULL DEFAULT 'MANAGER',
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS campeonatos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(80) NOT NULL,
    categoria VARCHAR(50) NOT NULL,
    numero_etapas INT NOT NULL CHECK (numero_etapas > 0)
);

CREATE TABLE IF NOT EXISTS equipes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(80) NOT NULL UNIQUE,
    pais VARCHAR(60) NOT NULL,
    orcamento_anual DECIMAL(14, 2) NOT NULL CHECK (orcamento_anual >= 0),
    campeonato_id INT NOT NULL,
    CONSTRAINT fk_equipes_campeonato
        FOREIGN KEY (campeonato_id) REFERENCES campeonatos(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS pilotos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    pais VARCHAR(60) NOT NULL,
    idade INT NOT NULL CHECK (idade >= 16 AND idade <= 60),
    salario_anual DECIMAL(12, 2) NOT NULL CHECK (salario_anual >= 0),
    overrall INT NOT NULL CHECK (overrall >= 0 AND overrall <= 100),
    status_contrato ENUM('Ativo', 'Disponivel', 'Em Negociacao') NOT NULL DEFAULT 'Ativo',
    equipe_id INT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_pilotos_equipe
        FOREIGN KEY (equipe_id) REFERENCES equipes(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
);

CREATE INDEX idx_usuarios_email ON usuarios(email);
CREATE INDEX idx_equipes_campeonato ON equipes(campeonato_id);
CREATE INDEX idx_pilotos_equipe ON pilotos(equipe_id);
CREATE INDEX idx_pilotos_overrall ON pilotos(overrall);


-- Usuários iniciais para testes (Senhas com hash bcrypt para a Fase de Auth)
-- Senha de teste padrão do hash abaixo: 'senha123'
INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES
('Administrador Geral', 'admin@motorsport.com', '$2a$10$wT/Ym2bE1k4M2bUaIiqnQ.xT8wDk8m7R3uO6x.vO7N.c6bK8a6Z.i', 'ADMIN'),
('Manager Carlos', 'carlos@manager.com', '$2a$10$wT/Ym2bE1k4M2bUaIiqnQ.xT8wDk8m7R3uO6x.vO7N.c6bK8a6Z.i', 'MANAGER'),
('Manager Helena', 'helena@manager.com', '$2a$10$wT/Ym2bE1k4M2bUaIiqnQ.xT8wDk8m7R3uO6x.vO7N.c6bK8a6Z.i', 'MANAGER');

-- Campeonatos
INSERT INTO campeonatos (nome, categoria, numero_etapas) VALUES
('World Motorsport Championship', 'Tier 1', 16),
('Asia-Pacific Super Cup', 'Tier 2', 12),
('European Racing Series', 'Tier 3', 10),
('International GT Championship', 'GT Tier 1', 14),
('Super GT Cup', 'GT Tier 2', 8);

-- Equipes
INSERT INTO equipes (nome, pais, orcamento_anual, campeonato_id) VALUES
('Steinmann Motorsport', 'Alemanha', 45000000.00, 1),
('Scuderia Rossini', 'Itália', 42000000.00, 1),
('Octane EMG', 'Estados Unidos', 22000000.00, 2),
('Archer BMR', 'Reino Unido', 12000000.00, 3),
('Predator Racing Group', 'Itália', 8500000.00, 3);

-- Pilotos
INSERT INTO pilotos (nome, pais, idade, salario_anual, overrall, status_contrato, equipe_id) VALUES
('Rafael Rodrigues', 'Brasil', 26, 4800000.00, 92, 'Ativo', 1),
('Ella Saarinen', 'Finlândia', 27, 5400000.00, 95, 'Ativo', 2),
('Lian Wei', 'China', 22, 1200000.00, 78, 'Ativo', 3),
('Bjorn Blomqvist', 'Suécia', 29, 950000.00, 74, 'Ativo', 4),
('Alejandro Silva', 'Espanha', 19, 450000.00, 68, 'Em Negociacao', 5),
('Chiara Montanari', 'Itália', 23, 3900000.00, 89, 'Disponivel', NULL);