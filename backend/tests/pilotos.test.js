const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const db = require('../src/config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'chave_mestra_motorsport_2026';

describe('Testes Automatizados', () => {
    let tokenAdmin;
    let tokenManager;
    let pilotoCriadoId;

    beforeAll(() => {
        tokenAdmin = jwt.sign(
            {id: 1, nome: 'Admin Teste', email: 'admin@teste.com', perfil: 'ADMIN'},
            JWT_SECRET,
            {expiresIn: '1h'}
        );

        tokenManager = jwt.sign(
            {if: 2, nome: 'Manager Teste', email: 'manager@teste.com', perfil: 'MANAGER'},
            JWT_SECRET,
            {expiresIn: '1h'}
        );
    });

    afterAll(async() => {
        if (pilotoCriadoId) {
            await db.query('DELETE FROM pilotos WHERE id = ?', [pilotoCriadoId]);
        }
    });

    it('1. Deve cadastrar um piloto com sucesso quando autenticado como ADMIN (Status 201)', async () => {
        const novoPiloto = {
          nome: 'Piloto Teste Jest',
          pais: 'Brasil',
          idade: 22,
          salario_anual: 1200000.00,
          overrall: 80,
          status_contrato: 'Ativo',
          equipe_id: 1
        };

        const resposta = await request(app)
            .post('/api/pilotos')
            .set('Authorization', 'Bearer ' + tokenAdmin)
            .send(novoPiloto);

        expect(resposta.status).toBe(201);
        expect(resposta.body).toHaveProperty('status', 'sucesso');
        expect(resposta.body.dados).toHaveProperty('id');
    });

    it('2. Deve rejeitar o cadastro quando campos obrigatórios estiverem ausentes (Status 400)', async () => {
        const pilotoInvalido = {
          nome: 'Piloto Incompleto'
        };

        const resposta = await request(app)
            .post('/api/pilotos')
            .set('Authorization', 'Bearer ' + tokenAdmin)
            .send(pilotoInvalido);

        expect(resposta.status).toBe(400);
        expect(resposta.body).toHaveProperty('status', 'erro');
        expect(resposta.body.mensagem).toMatch(/Campos obrigatórios/i);
    });

    it('3. Deve bloquear o acesso a rotas protegidas sem o token JWT (Status 401)', async () => {
        const resposta = await request(app)
          .get('/api/pilotos');

        expect(resposta.status).toBe(401);
        expect(resposta.body).toHaveProperty('status', 'erro');
    });

    it('4. Deve barrar criação por usuário com perfil MANAGER sem permissão (Status 403)', async () => {
        const piloto = {
          nome: 'Piloto Barrado',
          pais: 'Itália',
          idade: 24,
          salario_anual: 900000.00,
          overrall: 75,
          status_contrato: 'Ativo',
          equipe_id: 1
        };

        const resposta = await request(app)
            .post('/api/pilotos')
            .set('Authorization', 'Bearer ' + tokenManager)
            .send(piloto);

        expect(resposta.status).toBe(403);
        expect(resposta.body).toHaveProperty('status', 'erro');
    });

    it('5. Deve retornar erro 404 ao consultar piloto com ID inexistente (Status 404)', async () => {
        const resposta = await request(app)
          .get('/api/pilotos/999999')
          .set('Authorization', 'Bearer ' + tokenAdmin);
    
        expect(resposta.status).toBe(404);
        expect(resposta.body).toHaveProperty('status', 'erro');
    });
});