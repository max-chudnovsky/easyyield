function ensureDB(env:any){
  if (!env || !env.DB || typeof env.DB.prepare !== 'function') throw new Error('env.DB (D1) is required for auth operations');
  return env.DB;
}

export async function findUserByEmail(env: any, email: string){
  const DB = ensureDB(env);
  return DB.prepare('SELECT id, email, name, password_hash, created_at FROM users WHERE email = ?').bind(email).first();
}

export async function createUser(env: any, user: any){
  const DB = ensureDB(env);
  await DB.prepare('INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)').bind(user.id, user.email, user.name, user.password_hash).run();
  return { id: user.id, email: user.email, name: user.name };
}

export async function createSession(env: any, session: any){
  const DB = ensureDB(env);
  await DB.prepare('INSERT INTO sessions (id, user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)').bind(session.id, session.user_id, session.token, session.expires_at).run();
  return true;
}

export async function findSessionByToken(env: any, token: string){
  const DB = ensureDB(env);
  return DB.prepare('SELECT user_id FROM sessions WHERE token = ? AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)').bind(token).first();
}

export async function deleteSessionByToken(env: any, token: string){
  const DB = ensureDB(env);
  await DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
  return true;
}

export async function findUserById(env: any, id: string){
  const DB = ensureDB(env);
  return DB.prepare('SELECT id, email, name, created_at FROM users WHERE id = ?').bind(id).first();
}
