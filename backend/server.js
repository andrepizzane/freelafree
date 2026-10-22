// ============================================================
//  FreelaFree — Backend Node.js + Express + MySQL
//  server.js  (ponto de entrada)
// ============================================================

require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const path       = require('path');

const authRoutes      = require('./routes/auth');
const projetosRoutes  = require('./routes/projetos');
const propostasRoutes = require('./routes/propostas');
const matchesRoutes   = require('./routes/matches');
const mensagensRoutes = require('./routes/mensagens');
const usuariosRoutes  = require('./routes/usuarios');
const adminRoutes     = require('./routes/admin');
const denunciasRoutes = require('./routes/denuncias');
const avaliacoesRoutes = require('./routes/avaliacoes');
const pagamentosRoutes = require('./routes/pagamentos-mp');
const notificacoesRoutes = require('./routes/notificacoes');

const app  = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false }));

app.use(cors({
    origin: process.env.FRONTEND_ORIGIN || '*',
    methods: ['GET','POST','PUT','DELETE','PATCH'],
    allowedHeaders: ['Content-Type','Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Limite geral. O chat faz polling periódico, então um teto baixo demais
// derruba a própria aplicação (429). Continua protegendo contra abuso.
app.use('/api/', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: { erro: 'Muitas requisições. Tente novamente em alguns minutos.' }
}));

// Login/cadastro seguem restritos — é aqui que mora o risco de força bruta.
app.use('/api/auth/', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { erro: 'Muitas tentativas de autenticação. Aguarde 15 minutos.' }
}));

app.use(express.static(path.join(__dirname, '../frontend')));

// Serve as fotos de perfil e libera acesso cross-origin
// (frontend rodando em porta/domínio diferente do backend).
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
    setHeaders: (res) => res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
}));

app.use('/api/auth',      authRoutes);
app.use('/api/projetos',  projetosRoutes);
app.use('/api/propostas', propostasRoutes);
app.use('/api/matches',   matchesRoutes);
app.use('/api/mensagens', mensagensRoutes);
app.use('/api/usuarios',  usuariosRoutes);
app.use('/api/admin',     adminRoutes);
app.use('/api/denuncias', denunciasRoutes);
app.use('/api/avaliacoes', avaliacoesRoutes);
app.use('/api/pagamentos', pagamentosRoutes);
app.use('/api/notificacoes', notificacoesRoutes);

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.use((err, req, res, next) => {
    console.error('[Erro]', err.stack);
    res.status(err.status || 500).json({
        erro: err.message || 'Erro interno do servidor.'
    });
});

app.listen(PORT, () => {
    console.log(`✅  FreelaFree API rodando em http://localhost:${PORT}`);
});
