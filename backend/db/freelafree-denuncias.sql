-- ============================================================
--  FreelaFree — Tabela de denúncias (moderação)
--  freelafree-denuncias.sql
--
--  Seguro para rodar mais de uma vez (idempotente):
--    mysql -u root -p freelafree < freelafree-denuncias.sql
-- ============================================================

USE freelafree;

CREATE TABLE IF NOT EXISTS denuncias (
    id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
    denunciante_id  INT UNSIGNED NOT NULL,
    tipo            ENUM('projeto','usuario','mensagem') NOT NULL,
    alvo_id         INT UNSIGNED NOT NULL,
    motivo          VARCHAR(40)  NOT NULL,
    descricao       TEXT         NOT NULL,
    status          ENUM('pendente','resolvida','arquivada') NOT NULL DEFAULT 'pendente',
    acao_tomada     VARCHAR(30)  DEFAULT NULL,
    resolvido_em    DATETIME     DEFAULT NULL,
    resolvido_por   INT UNSIGNED DEFAULT NULL,
    criado_em       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_status (status),
    INDEX idx_alvo (tipo, alvo_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Se a tabela já existia sem alguma coluna, adiciona só o que falta ──
DROP PROCEDURE IF EXISTS ff_add_coluna;
DELIMITER $$
CREATE PROCEDURE ff_add_coluna(IN p_coluna VARCHAR(64), IN p_definicao VARCHAR(255))
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'denuncias' AND COLUMN_NAME = p_coluna
    ) THEN
        SET @sql = CONCAT('ALTER TABLE denuncias ADD COLUMN ', p_coluna, ' ', p_definicao);
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END$$
DELIMITER ;

CALL ff_add_coluna('acao_tomada',   'VARCHAR(30) DEFAULT NULL');
CALL ff_add_coluna('resolvido_em',  'DATETIME DEFAULT NULL');
CALL ff_add_coluna('resolvido_por', 'INT UNSIGNED DEFAULT NULL');

DROP PROCEDURE IF EXISTS ff_add_coluna;

-- Garante que o status aceita 'arquivada'
ALTER TABLE denuncias
    MODIFY status ENUM('pendente','resolvida','arquivada') NOT NULL DEFAULT 'pendente';
