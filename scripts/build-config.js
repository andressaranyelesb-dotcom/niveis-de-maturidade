// Gera public/config.js a partir das variáveis de ambiente (Vercel → Settings → Environment Variables).
// O arquivo gerado NÃO é versionado (.gitignore). Recusa chaves secretas para que nunca cheguem ao navegador.
const fs = require('fs');
const path = require('path');

// uso local: lê .env (se existir) sem sobrescrever variáveis já definidas
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
  if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
}

const url = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
const key = (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
const domains = (process.env.ALLOWED_EMAIL_DOMAINS || '')
  .split(',').map(s => s.trim().toLowerCase().replace(/^@/, '')).filter(Boolean);

const fail = msg => { console.error('\n[build-config] ' + msg + '\n'); process.exit(1); };

if (!url || !key) fail('Defina SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY nas variáveis de ambiente (veja .env.example).');
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) fail('SUPABASE_URL inválida. Formato esperado: https://<ref>.supabase.co');

// bloqueia service_role / secret: essas chaves ignoram o RLS e jamais podem ir para o navegador
if (/^sb_secret_/i.test(key)) fail('Chave SECRETA detectada (sb_secret_...). Use a chave publicável (sb_publishable_...).');
if (key.split('.').length === 3) {
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64').toString('utf8'));
    if (payload.role && payload.role !== 'anon') fail('Chave com papel "' + payload.role + '" detectada. Use somente a chave pública (anon/publishable).');
  } catch (e) { /* não é JWT: segue */ }
}

const out = path.join(__dirname, '..', 'public', 'config.js');
const cfg = { supabaseUrl: url, supabaseKey: key, allowedDomains: domains };
fs.writeFileSync(out, '// Gerado no build por scripts/build-config.js. Não edite nem versione.\nwindow.APP_CONFIG = ' + JSON.stringify(cfg) + ';\n');
console.log('[build-config] public/config.js gerado (' + url + (domains.length ? ', domínios: ' + domains.join(', ') : '') + ').');
