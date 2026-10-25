require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD ||'',
    database: process.env.DB_NAME || 'motorsport_db',
    port: process.env.DB_PORT || 3306 ,
});

async function popularBancoDeDados() {
    let connection;
    try {
        const jsonPath = path.join(__dirname, 'dados.json');
        const dataRaw = fs.readFileSync(jsonPath, 'utf-8');
        const jsonParsed = JSON.parse(dataRaw) 

        connection = await pool.getConnection();

        await connection.query('SET FOREIGN_KEY_CHECKS = 0;');

        await connection.query('TRUNCATE TABLE pilotos;');
        await connection.query('TRUNCATE TABLE equipes;');

        for (const equipe of jsonParsed.equipes) {
            await connection.execute(`
              INSERT INTO equipes (id, nome, pais, orcamento_anual, cor_primaria, cor_secundaria) 
              VALUES (?, ?, ?, ?, ?, ?)
            `, [
              equipe.id, 
              equipe.nome, 
              equipe.pais || 'Internacional', 
              equipe.orcamento_anual || 10000000, 
              equipe.cor_primaria || '#383e4d', 
              equipe.cor_secundaria || '#ffffff'
            ]);
        }

        for (const piloto of jsonParsed.pilotos) {
            // Normalização do potencial/overall (se ele era 4.5 estrelas, vira 90 overall)
            let overallVal = piloto.atributos ? Math.floor(Object.values(piloto.atributos).reduce((a,b)=>a+b)/Object.values(piloto.atributos).length) : 0;
            if (overallVal === 0 && piloto.potencial_estrelas) {
                overallVal = piloto.potencial_estrelas * 20;
            }
            await connection.execute(`
                INSERT INTO pilotos (id, nome, pais, idade, equipe_id, salario_anual, overrall, status_contrato) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              `, [
                piloto.id,
                piloto.nome,
                piloto.nacionalidade || piloto.pais || 'Internacional',
                piloto.idade || 25,
                piloto.equipe_id || null,
                piloto.salario_anual || 1500000,
                overallVal || 50,
                piloto.status_contrato || 'Ativo'
            ]);
        }

        await connection.query('SET FOREIGN_KEY_CHECKS = 1;');

        console.log('Banco de dados populado com dados.json');

    } catch (erro) {
        console.error('Erro ao popular o banco de dados', dados); 
    } finally {
        if (connection) connection.release();
        pool.end();
    }
}

popularBancoDeDados();