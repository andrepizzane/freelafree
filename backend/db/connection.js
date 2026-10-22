// ============================================================
//  FreelaFree — Pool de conexão MySQL
//  db/connection.js
// ============================================================

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host:               process.env.DB_HOST     || 'localhost',
    port:               parseInt(process.env.DB_PORT) || 3306,
    user:               process.env.DB_USER     || 'root',
    password:           process.env.DB_PASSWORD || '',
    database:           process.env.DB_NAME     || 'freelafree',
    waitForConnections: true,
    connectionLimit:    10,
    queueLimit:         0,
    charset:            'utf8mb4',
    timezone:           '-03:00',
    dateStrings:        false
});

(async () => {
    try {
        const conn = await pool.getConnection();
        console.log('✅  Banco de dados MySQL conectado com sucesso.');
        conn.release();
    } catch (err) {
        console.error('❌  Falha ao conectar ao banco de dados:', err.message);
        console.error('    Verifique as variáveis DB_HOST, DB_USER, DB_PASSWORD e DB_NAME no .env');
    }
})();

module.exports = pool;
