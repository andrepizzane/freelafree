-- ============================================================
--  FreelaFree — Schema LOCAL (reconstruído a partir do backend)
--  Para testar no seu PC via MySQL Workbench.
--  Rode este arquivo inteiro com o banco `freelafree` selecionado.
-- ============================================================

CREATE DATABASE IF NOT EXISTS freelafree
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE freelafree;

-- ── Tabela de usuários ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  tipo_doc    ENUM('cpf','cnpj') NOT NULL,
  documento   VARCHAR(20)  NOT NULL UNIQUE,
  nome        VARCHAR(100) NOT NULL,
  sobrenome   VARCHAR(100),
  email       VARCHAR(150) NOT NULL UNIQUE,
  telefone    VARCHAR(20),
  senha_hash  VARCHAR(255) NOT NULL,
  perfil      ENUM('freelancer','contratante','ambos') NOT NULL DEFAULT 'ambos',
  ativo       TINYINT NOT NULL DEFAULT 1,
  criado_em   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── Tabela de sessões (usada no login) ──────────────────────
CREATE TABLE IF NOT EXISTS sessoes (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT NOT NULL,
  token       VARCHAR(255) NOT NULL,
  ip          VARCHAR(45),
  user_agent  VARCHAR(255),
  expira_em   DATETIME NOT NULL,
  criado_em   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- ── Tabela de recuperação de senha (o que faltava) ──────────
CREATE TABLE IF NOT EXISTS tokens_recuperacao (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT NOT NULL,
  codigo      VARCHAR(6) NOT NULL,
  expira_em   DATETIME NOT NULL,
  usado       TINYINT NOT NULL DEFAULT 0,
  criado_em   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- ============================================================
--  Usuário de TESTE para demonstrar a recuperação de senha.
--  IMPORTANTE: troque o e-mail abaixo por UM E-MAIL SEU DE VERDADE,
--  senão o código de recuperação não chega em lugar nenhum.
--
--  Documento (CPF de teste): 111.444.777-35  (CPF matematicamente válido)
--  Senha inicial:            senha12345
--  (o hash abaixo é bcrypt de "senha12345")
-- ============================================================
INSERT INTO usuarios (tipo_doc, documento, nome, sobrenome, email, telefone, senha_hash, perfil)
VALUES (
  'cpf',
  '111.444.777-35',
  'Usuario',
  'Teste',
  'COLOQUE_SEU_EMAIL_AQUI@gmail.com',   -- ← TROQUE por um e-mail seu real
  NULL,
  '$2b$12$p4w7KaKhrCMl7kB.22x/eucxY.vSRKR3PqZMlcH1esJzlvjvptw.a',  -- senha12345
  'ambos'
);
