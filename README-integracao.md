# FreelaFree — Guia de Integração Frontend ↔ Banco de Dados

## O que foi feito

Todos os arquivos abaixo foram atualizados ou criados para conectar o site ao banco MySQL via API REST Node.js.

---

## Arquivos novos / atualizados

### Frontend
| Arquivo | O que mudou |
|---|---|
| `api.js` | **NOVO** — módulo central de comunicação com a API. Inclui `Auth` (JWT), `ApiAuth`, `ApiProjetos`, `ApiPropostas`, `ApiMatches`, `ApiMensagens`, `ApiUsuarios` |
| `login.html` | Chama `POST /api/auth/login`, salva JWT no localStorage, redireciona após sucesso |
| `cadastro.html` | Chama `POST /api/auth/cadastro`, faz login automático após criar conta |
| `publicar.html` | Chama `POST /api/projetos` (requer login), protege a página se não autenticado |
| `trabalhos.html` | Carrega projetos do banco via `GET /api/projetos` com filtros e paginação reais; propostas enviadas via `POST /api/propostas` |
| `recuperar.html` | Fluxo completo de 3 passos usando `/api/auth/recuperar/*` |

### Backend (rotas faltantes)
| Arquivo | Rotas |
|---|---|
| `routes/matches.js` | `GET /api/matches/meus`, `GET /api/matches/:id`, `PATCH /api/matches/:id/concluir` |
| `routes/mensagens.js` | `GET /api/mensagens/:matchId`, `POST /api/mensagens/:matchId`, `PATCH /api/mensagens/:matchId/lidas` |
| `routes/usuarios.js` | `GET /api/usuarios/me`, `PUT /api/usuarios/me`, `GET /api/usuarios/:id` |

---

## Estrutura de pastas esperada

```
freelafree/
├── frontend/           ← arquivos HTML, CSS, JS do site
│   ├── api.js          ← NOVO: inclua em todas as páginas
│   ├── index.html
│   ├── login.html
│   ├── cadastro.html
│   ├── publicar.html
│   ├── trabalhos.html
│   ├── recuperar.html
│   └── ...
│
└── backend/
    ├── server.js
    ├── .env            ← crie a partir do env.example
    ├── db/
    │   └── connection.js
    ├── middleware/
    │   └── auth.js     ← auth(1).js renomeado
    └── routes/
        ├── auth.js
        ├── projetos.js
        ├── propostas.js
        ├── matches.js  ← NOVO
        ├── mensagens.js← NOVO
        └── usuarios.js ← NOVO
```

---

## Passo a passo para rodar

### 1. Banco de dados

```bash
# No MySQL Workbench ou terminal:
mysql -u root -p < freelafree_banco.sql
```

### 2. Configurar o .env

```bash
cd backend
cp ../env.example .env
```

Edite o `.env` com seus dados reais:
```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=SUA_SENHA_MYSQL
DB_NAME=freelafree

JWT_SECRET=gere_um_segredo_forte_64_chars_minimo
JWT_EXPIRES_IN=7d

NODE_ENV=development
PORT=3000
```

Para gerar o JWT_SECRET:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. Instalar dependências

```bash
cd backend
npm init -y
npm install express mysql2 bcrypt jsonwebtoken dotenv cors helmet express-rate-limit crypto
```

### 4. Copiar as rotas novas para o backend

Copie os três arquivos abaixo para `backend/routes/`:
- `matches.js`
- `mensagens.js`
- `usuarios.js`

Renomeie `auth__1_.js` → `middleware/auth.js` (ou mantenha o nome original e ajuste o import no server.js).

### 5. Iniciar o servidor

```bash
cd backend
node server.js
# ou com nodemon para desenvolvimento:
npx nodemon server.js
```

O servidor sobe em: `http://localhost:3000`

### 6. Copiar o api.js para o frontend

Coloque `api.js` na mesma pasta dos HTMLs. Ele deve ser carregado **antes** dos scripts de cada página:

```html
<script src="api.js"></script>
<script>
  // código da página aqui
</script>
```

---

## Como funciona a autenticação

1. Usuário faz login → backend retorna um **JWT**
2. `api.js` salva o token em `localStorage` com `Auth.salvar(token, usuario)`
3. Todas as requisições que precisam de autenticação enviam automaticamente `Authorization: Bearer <token>`
4. O token expira conforme `JWT_EXPIRES_IN` (padrão: 7 dias)
5. Logout chama `POST /api/auth/logout` e limpa o localStorage

---

## Testando sem backend (modo offline)

Se quiser testar só o visual sem o servidor rodando, as páginas originais (com dados simulados) ainda funcionam — apenas o `trabalhos.html` original carregava dados mockados. As versões novas tentam a API e mostram um erro amigável se ela não estiver disponível.

---

## Próximos passos sugeridos

- [ ] Configurar envio de e-mail real no `auth.js` (descomentando o bloco nodemailer)
- [ ] Atualizar `mensagens.html` para usar `ApiMensagens` e `ApiMatches`
- [ ] Atualizar `match.html` para usar `ApiMatches` e `ApiPropostas`
- [ ] Adicionar proteção de rotas em todas as páginas que exigem login
- [ ] Deploy: Railway, Render, ou VPS com PM2 + Nginx

---

© 2026 FreelaFree
