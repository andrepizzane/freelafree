-- ============================================================
--  FreelaFree — Chat: tabelas + dados de teste (LOCAL)
--  Rode no Workbench com o banco `freelafree` selecionado.
--  Seguro rodar mais de uma vez (usa IF NOT EXISTS / NOT EXISTS).
-- ============================================================
USE freelafree;

-- ── Tabela de projetos (matches dependem dela) ──────────────
CREATE TABLE IF NOT EXISTS projetos (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  contratante_id INT NOT NULL,
  titulo         VARCHAR(120) NOT NULL,
  descricao      TEXT,
  categoria      VARCHAR(50),
  orcamento      DECIMAL(10,2),
  tipo_orcamento VARCHAR(20),
  prazo          VARCHAR(50),
  urgencia       VARCHAR(20),
  status         VARCHAR(20) NOT NULL DEFAULT 'aberto',
  criado_em      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (contratante_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- ── Tabela de matches (as conversas) ────────────────────────
CREATE TABLE IF NOT EXISTS matches (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  projeto_id     INT NOT NULL,
  freelancer_id  INT NOT NULL,
  contratante_id INT NOT NULL,
  status         VARCHAR(20) NOT NULL DEFAULT 'em_andamento',
  criado_em      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (projeto_id)     REFERENCES projetos(id) ON DELETE CASCADE,
  FOREIGN KEY (freelancer_id)  REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY (contratante_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- ── Tabela de mensagens ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS mensagens (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  match_id     INT NOT NULL,
  remetente_id INT NOT NULL,
  conteudo     TEXT NOT NULL,
  lida         TINYINT NOT NULL DEFAULT 0,
  enviado_em   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (match_id)     REFERENCES matches(id)  ON DELETE CASCADE,
  FOREIGN KEY (remetente_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- ============================================================
--  DADOS DE TESTE
--  Usuário 1 (já existe): 111.444.777-35  → será o FREELANCER
--  Usuário 2 (criado aqui): 529.982.247-25 → será a CONTRATANTE
--  Senha do usuário 2: senha12345
-- ============================================================

-- Segundo usuário (contratante) — senha: senha12345
INSERT INTO usuarios (tipo_doc, documento, nome, sobrenome, email, telefone, senha_hash, perfil)
SELECT 'cpf','529.982.247-25','Ana','Contratante','ana.teste@freelafree.local',NULL,
       '$2b$12$p4w7KaKhrCMl7kB.22x/eucxY.vSRKR3PqZMlcH1esJzlvjvptw.a','ambos'
WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE documento='529.982.247-25');

-- Projeto publicado pela contratante
INSERT INTO projetos (contratante_id, titulo, descricao, categoria, orcamento, tipo_orcamento, prazo, urgencia, status)
SELECT (SELECT id FROM usuarios WHERE documento='529.982.247-25'),
       'Logo para startup',
       'Criacao de identidade visual completa para uma startup de tecnologia.',
       'Design', 800.00, 'fixo', '1 semana', 'Normal', 'em_andamento'
WHERE NOT EXISTS (SELECT 1 FROM projetos WHERE titulo='Logo para startup');

-- Match entre o freelancer (user 1) e a contratante (user 2)
INSERT INTO matches (projeto_id, freelancer_id, contratante_id, status)
SELECT (SELECT id FROM projetos WHERE titulo='Logo para startup' LIMIT 1),
       (SELECT id FROM usuarios WHERE documento='111.444.777-35'),
       (SELECT id FROM usuarios WHERE documento='529.982.247-25'),
       'em_andamento'
WHERE NOT EXISTS (
  SELECT 1 FROM matches
  WHERE projeto_id = (SELECT id FROM projetos WHERE titulo='Logo para startup' LIMIT 1)
);

-- Mensagens de exemplo (cada uma protegida contra duplicar)
INSERT INTO mensagens (match_id, remetente_id, conteudo, lida, enviado_em)
SELECT (SELECT id FROM matches WHERE projeto_id=(SELECT id FROM projetos WHERE titulo='Logo para startup' LIMIT 1) LIMIT 1),
       (SELECT id FROM usuarios WHERE documento='529.982.247-25'),
       'Ola! Vi que voce topou o projeto do logo. Podemos alinhar os detalhes?', 1, NOW() - INTERVAL 12 MINUTE
WHERE NOT EXISTS (SELECT 1 FROM mensagens WHERE conteudo LIKE 'Ola! Vi que voce topou%');

INSERT INTO mensagens (match_id, remetente_id, conteudo, lida, enviado_em)
SELECT (SELECT id FROM matches WHERE projeto_id=(SELECT id FROM projetos WHERE titulo='Logo para startup' LIMIT 1) LIMIT 1),
       (SELECT id FROM usuarios WHERE documento='111.444.777-35'),
       'Oi Ana! Claro. Consigo entregar a identidade completa em 1 semana.', 1, NOW() - INTERVAL 8 MINUTE
WHERE NOT EXISTS (SELECT 1 FROM mensagens WHERE conteudo LIKE 'Oi Ana! Claro%');

INSERT INTO mensagens (match_id, remetente_id, conteudo, lida, enviado_em)
SELECT (SELECT id FROM matches WHERE projeto_id=(SELECT id FROM projetos WHERE titulo='Logo para startup' LIMIT 1) LIMIT 1),
       (SELECT id FROM usuarios WHERE documento='529.982.247-25'),
       'Perfeito! Pode comecar. Qualquer duvida falo por aqui.', 0, NOW() - INTERVAL 3 MINUTE
WHERE NOT EXISTS (SELECT 1 FROM mensagens WHERE conteudo LIKE 'Perfeito! Pode comecar%');
