const fs = require('fs');
const { type } = require('os');
const path = require('path');

const logDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, {recursive: true});
}

const logFilePath = path.join(logDir, 'app.log');

function log(tipo, modulo, ...mensagens) {
    const timestamp = new Date().toISOString();
    const textoMensagens = mensagens.map(m => (typeof m === 'object' ? JSON.stringify(m) : m)).join(' ');
    const linhaLog = `[${timestamp}] [${tipo.toUpperCase()}] [${modulo.toUpperCase()}] ${textoMensagens}\n`;

    process.stdout.write(linhaLog);

    fs.appendFile(logFilePath, linhaLog, (err) => {
        if (err) console.error('Falha ao gravar arquivo de log:', err.message);
    });
}
  
module.exports = {
    info: (modulo, ...mensagens) => log('INFO', modulo, ...mensagens),
    warn: (modulo, ...mensagens) => log('WARN', modulo, ...mensagens),
    error: (modulo, ...mensagens) => log('ERROR', modulo, ...mensagens)
};