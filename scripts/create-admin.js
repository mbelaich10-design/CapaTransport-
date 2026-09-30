// Usage : npm run admin:create -- email@exemple.fr   (le mot de passe est saisi sans écho)
import readline from 'node:readline';
import { loadEnv } from '../src/config/env.js';
import { openDatabase } from '../src/db/index.js';
import { createAuthService, MIN_PASSWORD_LENGTH } from '../src/services/auth.js';

const env = loadEnv();
const email = process.argv[2] || env.adminEmail;
if (!email) { console.error('Usage : npm run admin:create -- email@exemple.fr'); process.exit(1); }

async function ask(prompt) {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = (s) => { if (s.includes(prompt)) rl.output.write(s); };
  return new Promise((resolve) => rl.question(prompt, (a) => { rl.close(); process.stdout.write('\n'); resolve(a); }));
}

const password = await ask(`Mot de passe (${MIN_PASSWORD_LENGTH} caractères min.) : `);
const db = openDatabase(env.dbPath);
try {
  await createAuthService(db).createAdmin(email, password);
  console.log(`Administrateur créé : ${email}`);
} catch (err) {
  console.error(err.message.includes('UNIQUE') ? 'Cet email existe déjà.' : err.message);
  process.exitCode = 1;
}
db.close();
