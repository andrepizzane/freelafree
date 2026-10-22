-- ============================================================
--  FreelaFree — Schema MySQL Completo (v2)
--  freelafree_banco.sql
--
--  Como usar:
--    mysql -u root -p < freelafree_banco.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS freelafree
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE freelafree;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS avaliacoes;
DROP TABLE IF EXISTS pagamentos;
DROP TABLE IF EXISTS tokens_recuperacao;
DROP TABLE IF EXISTS sessoes;
DROP TABLE IF EXISTS mensagens;
DROP TABLE IF EXISTS matches;
DROP TABLE IF EXISTS propostas;
DROP TABLE IF EXISTS projetos;
DROP TABLE IF EXISTS usuarios;
SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
--  TABELA: usuarios
-- ============================================================
CREATE TABLE usuarios (
    id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
    tipo_doc         ENUM('cpf','cnpj') NOT NULL,
    documento        VARCHAR(20)  NOT NULL,
    nome             VARCHAR(120) NOT NULL,
    sobrenome        VARCHAR(120) DEFAULT NULL,
    email            VARCHAR(180) NOT NULL,
    telefone         VARCHAR(20)  DEFAULT NULL,
    senha_hash       VARCHAR(255) NOT NULL,
    perfil           ENUM('freelancer','contratante','ambos') NOT NULL DEFAULT 'ambos',
    nota_media       DECIMAL(3,2) DEFAULT NULL,
    total_avaliacoes INT UNSIGNED NOT NULL DEFAULT 0,
    ativo            TINYINT(1)   NOT NULL DEFAULT 1,
    criado_em        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_documento (documento),
    UNIQUE KEY uq_email     (email),
    INDEX idx_ativo (ativo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
--  TABELA: sessoes
-- ============================================================
CREATE TABLE sessoes (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    usuario_id  INT UNSIGNED NOT NULL,
    token       VARCHAR(128) NOT NULL,
    ip          VARCHAR(45)  DEFAULT NULL,
    user_agent  VARCHAR(255) DEFAULT NULL,
    criado_em   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expira_em   DATETIME     NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_token (token),
    INDEX idx_usuario (usuario_id),
    INDEX idx_expira  (expira_em),
    CONSTRAINT fk_sessoes_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
--  TABELA: tokens_recuperacao
-- ============================================================
CREATE TABLE tokens_recuperacao (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    usuario_id  INT UNSIGNED NOT NULL,
    codigo      CHAR(6)      NOT NULL,
    usado       TINYINT(1)   NOT NULL DEFAULT 0,
    criado_em   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expira_em   DATETIME     NOT NULL,
    PRIMARY KEY (id),
    INDEX idx_tr_usuario (usuario_id),
    INDEX idx_tr_expira  (expira_em),
    CONSTRAINT fk_tr_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
--  TABELA: projetos
-- ============================================================
CREATE TABLE projetos (
    id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    contratante_id  INT UNSIGNED  NOT NULL,
    titulo          VARCHAR(80)   NOT NULL,
    descricao       TEXT          NOT NULL,
    categoria       ENUM('Design','Programação','Redação','Marketing','Vídeo','Tradução','Consultoria','Outro') NOT NULL DEFAULT 'Outro',
    orcamento       DECIMAL(10,2) DEFAULT NULL,
    tipo_orcamento  ENUM('fixo','hora') NOT NULL DEFAULT 'fixo',
    prazo           ENUM('Até 3 dias','1 semana','2 semanas','1 mês+') NOT NULL DEFAULT '1 semana',
    urgencia        ENUM('Baixa','Normal','Alta') NOT NULL DEFAULT 'Normal',
    status          ENUM('aberto','em_andamento','concluido','cancelado') NOT NULL DEFAULT 'aberto',
    criado_em       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_proj_status      (status),
    INDEX idx_proj_categoria   (categoria),
    INDEX idx_proj_contratante (contratante_id),
    INDEX idx_proj_criado      (criado_em),
    FULLTEXT idx_ft_proj       (titulo, descricao),
    CONSTRAINT fk_proj_contratante
        FOREIGN KEY (contratante_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
--  TABELA: propostas
-- ============================================================
CREATE TABLE propostas (
    id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    projeto_id      INT UNSIGNED  NOT NULL,
    freelancer_id   INT UNSIGNED  NOT NULL,
    valor           DECIMAL(10,2) NOT NULL,
    prazo_proposto  VARCHAR(80)   NOT NULL,
    mensagem        TEXT          NOT NULL,
    status          ENUM('pendente','aceita','recusada') NOT NULL DEFAULT 'pendente',
    criado_em       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_proposta_unica (projeto_id, freelancer_id),
    INDEX idx_prop_freelancer    (freelancer_id),
    INDEX idx_prop_status        (status),
    CONSTRAINT fk_prop_projeto
        FOREIGN KEY (projeto_id)    REFERENCES projetos (id) ON DELETE CASCADE,
    CONSTRAINT fk_prop_freelancer
        FOREIGN KEY (freelancer_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
--  TABELA: matches
-- ============================================================
CREATE TABLE matches (
    id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
    proposta_id     INT UNSIGNED NOT NULL,
    projeto_id      INT UNSIGNED NOT NULL,
    freelancer_id   INT UNSIGNED NOT NULL,
    contratante_id  INT UNSIGNED NOT NULL,
    status          ENUM('ativo','concluido','cancelado') NOT NULL DEFAULT 'ativo',
    criado_em       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_match_proposta (proposta_id),
    INDEX idx_match_freelancer   (freelancer_id),
    INDEX idx_match_contratante  (contratante_id),
    INDEX idx_match_projeto      (projeto_id),
    CONSTRAINT fk_match_proposta
        FOREIGN KEY (proposta_id)    REFERENCES propostas (id) ON DELETE CASCADE,
    CONSTRAINT fk_match_projeto
        FOREIGN KEY (projeto_id)     REFERENCES projetos  (id) ON DELETE CASCADE,
    CONSTRAINT fk_match_freelancer
        FOREIGN KEY (freelancer_id)  REFERENCES usuarios  (id) ON DELETE CASCADE,
    CONSTRAINT fk_match_contratante
        FOREIGN KEY (contratante_id) REFERENCES usuarios  (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
--  TABELA: mensagens
-- ============================================================
CREATE TABLE mensagens (
    id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
    match_id     INT UNSIGNED NOT NULL,
    remetente_id INT UNSIGNED NOT NULL,
    conteudo     TEXT         NOT NULL,
    tipo         ENUM('texto','proposta','pagamento','avaliacao','sistema') NOT NULL DEFAULT 'texto',
    meta_json    JSON         DEFAULT NULL,
    lida         TINYINT(1)   NOT NULL DEFAULT 0,
    enviado_em   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_msg_match     (match_id),
    INDEX idx_msg_remetente (remetente_id),
    INDEX idx_msg_lida      (lida),
    INDEX idx_msg_enviado   (enviado_em),
    CONSTRAINT fk_msg_match
        FOREIGN KEY (match_id)      REFERENCES matches  (id) ON DELETE CASCADE,
    CONSTRAINT fk_msg_remetente
        FOREIGN KEY (remetente_id)  REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
--  TABELA: avaliacoes
-- ============================================================
CREATE TABLE avaliacoes (
    id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
    match_id     INT UNSIGNED NOT NULL,
    avaliador_id INT UNSIGNED NOT NULL,
    avaliado_id  INT UNSIGNED NOT NULL,
    nota         TINYINT      NOT NULL,
    comentario   TEXT         DEFAULT NULL,
    criado_em    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_avaliacao_match (match_id, avaliador_id),
    INDEX idx_av_avaliado  (avaliado_id),
    INDEX idx_av_avaliador (avaliador_id),
    CONSTRAINT chk_nota CHECK (nota BETWEEN 1 AND 5),
    CONSTRAINT fk_av_match
        FOREIGN KEY (match_id)     REFERENCES matches  (id) ON DELETE CASCADE,
    CONSTRAINT fk_av_avaliador
        FOREIGN KEY (avaliador_id) REFERENCES usuarios (id) ON DELETE CASCADE,
    CONSTRAINT fk_av_avaliado
        FOREIGN KEY (avaliado_id)  REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
--  TABELA: pagamentos
-- ============================================================
CREATE TABLE pagamentos (
    id           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    match_id     INT UNSIGNED  NOT NULL,
    pagador_id   INT UNSIGNED  NOT NULL,
    recebedor_id INT UNSIGNED  NOT NULL,
    valor        DECIMAL(10,2) NOT NULL,
    metodo       ENUM('pix','transferencia','boleto','cartao') NOT NULL DEFAULT 'pix',
    observacao   TEXT          DEFAULT NULL,
    status       ENUM('registrado','confirmado','cancelado') NOT NULL DEFAULT 'registrado',
    criado_em    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_pag_match     (match_id),
    INDEX idx_pag_pagador   (pagador_id),
    INDEX idx_pag_recebedor (recebedor_id),
    CONSTRAINT fk_pag_match
        FOREIGN KEY (match_id)     REFERENCES matches  (id) ON DELETE CASCADE,
    CONSTRAINT fk_pag_pagador
        FOREIGN KEY (pagador_id)   REFERENCES usuarios (id) ON DELETE CASCADE,
    CONSTRAINT fk_pag_recebedor
        FOREIGN KEY (recebedor_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
--  TRIGGER: recalcula nota_media do usuario apos avaliacao
-- ============================================================
DELIMITER //
CREATE TRIGGER trg_atualizar_nota_media
AFTER INSERT ON avaliacoes
FOR EACH ROW
BEGIN
    UPDATE usuarios
    SET
        nota_media       = (SELECT AVG(nota)  FROM avaliacoes WHERE avaliado_id = NEW.avaliado_id),
        total_avaliacoes = (SELECT COUNT(*)   FROM avaliacoes WHERE avaliado_id = NEW.avaliado_id)
    WHERE id = NEW.avaliado_id;
END //
DELIMITER ;

-- ============================================================
--  DADOS DE EXEMPLO  (senha: Teste@123)
-- ============================================================
INSERT INTO usuarios (tipo_doc, documento, nome, sobrenome, email, telefone, senha_hash, perfil) VALUES
('cpf',  '123.456.789-09',     'Carlos',        'Mendes', 'carlos@exemplo.com',   '(11) 91234-5678', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMaJobRd3PfLBkT6ynPExL6Bpm', 'freelancer'),
('cnpj', '11.222.333/0001-44', 'TechNova Ltda', NULL,     'contato@technova.com', '(11) 93333-4444', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMaJobRd3PfLBkT6ynPExL6Bpm', 'contratante');

INSERT INTO projetos (contratante_id, titulo, descricao, categoria, orcamento, tipo_orcamento, prazo, urgencia) VALUES
(2, 'Criar landing page para produto SaaS',
   'Precisamos de uma landing page responsiva e moderna. Deve incluir hero section, features, pricing e CTA. Entregar em Figma + HTML/CSS.',
   'Design', 2500.00, 'fixo', '2 semanas', 'Normal'),
(2, 'Integração de API de pagamento Pix',
   'Integrar gateway de pagamento Pix em nossa plataforma Node.js. QR Code, webhook de confirmação e relatórios.',
   'Programação', 3800.00, 'fixo', '1 semana', 'Alta');

-- ============================================================
--  VIEWS
-- ============================================================
CREATE OR REPLACE VIEW vw_projetos_abertos AS
SELECT p.id, p.titulo, p.descricao, p.categoria, p.orcamento, p.tipo_orcamento,
       p.prazo, p.urgencia, p.criado_em,
       u.nome AS contratante_nome, u.email AS contratante_email,
       (SELECT COUNT(*) FROM propostas pr WHERE pr.projeto_id = p.id AND pr.status = 'pendente') AS total_propostas
FROM projetos p JOIN usuarios u ON u.id = p.contratante_id
WHERE p.status = 'aberto';

CREATE OR REPLACE VIEW vw_matches_com_detalhes AS
SELECT m.id AS match_id, m.status AS match_status, m.criado_em AS match_criado_em,
       p.id AS projeto_id, p.titulo AS projeto_titulo, p.categoria, p.orcamento, p.prazo,
       uf.id AS freelancer_id, uf.nome AS freelancer_nome, uf.email AS freelancer_email,
       uf.nota_media AS freelancer_nota, uf.total_avaliacoes,
       uc.id AS contratante_id, uc.nome AS contratante_nome, uc.email AS contratante_email,
       (SELECT COUNT(*) FROM mensagens ms WHERE ms.match_id = m.id) AS total_mensagens
FROM matches m
JOIN projetos p  ON p.id = m.projeto_id
JOIN usuarios uf ON uf.id = m.freelancer_id
JOIN usuarios uc ON uc.id = m.contratante_id;

-- ============================================================
--  PROCEDURES DE LIMPEZA
-- ============================================================
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS sp_limpar_sessoes_expiradas()
BEGIN DELETE FROM sessoes WHERE expira_em < NOW(); END //
CREATE PROCEDURE IF NOT EXISTS sp_limpar_tokens_recuperacao()
BEGIN DELETE FROM tokens_recuperacao WHERE usado = 1 OR expira_em < NOW(); END //
DELIMITER ;

CREATE EVENT IF NOT EXISTS evt_limpeza_diaria
    ON SCHEDULE EVERY 1 DAY
    STARTS (CURDATE() + INTERVAL 1 DAY + INTERVAL 3 HOUR)
    DO BEGIN
        CALL sp_limpar_sessoes_expiradas();
        CALL sp_limpar_tokens_recuperacao();
    END;

SELECT 'Banco freelafree criado com sucesso! (v2 - 8 tabelas)' AS status;
SHOW TABLES;
