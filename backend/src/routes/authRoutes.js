const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { autenticarToken } = require('../middlewares/authMiddleware');

// Públicas
router.post('/login', authController.login);
router.post('/registrar', authController.registrar);

// Exigem token
router.post('/logout', autenticarToken, authController.logout);
router.get('/perfil', autenticarToken, authController.obterPerfil);

module.exports = router;