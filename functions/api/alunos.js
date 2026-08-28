// Gestão de alunos (área restrita /alunos) — exige a senha PUBLISH_KEY.
// GET  /api/alunos?chave=...            → lista todos (JSON)
// POST /api/alunos?modo=status          → altera status (id, status)
// POST /api/alunos?modo=editar          → edita campos (id, campo, valor)
// DELETE /api/alunos?chave=...&id=N     → exclui aluno

const EDITAVEIS = ['nome','nascimento','whatsapp','email','endereco','turma','emergencia_nome','emergencia_fone','saude','cobranca_nome','cobranca_email','cobranca_whatsapp','status'];

export async function onRequestGet(context) {
  const { env, request } = context;
  const db = env.DB;
  if (!db) return json({ error: 'Banco não configurado' }, 500);
  const u = new URL(request.url);
  if (!auth(env, u.searchParams.get('chave'))) return json({ error: 'Senha incorreta' }, 401);
  let rows;
  try {
    rows = (await db.prepare('SELECT * FROM alunos ORDER BY nome COLLATE NOCASE').all()).results || [];
  } catch (e) { rows = []; } // tabela ainda não existe = nenhum aluno
  return json({ alunos: rows });
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const db = env.DB;
  if (!db) return json({ error: 'Banco não configurado' }, 500);
  const form = await request.formData();
  if (!auth(env, form.get('chave'))) return json({ error: 'Senha incorreta' }, 401);
  const u = new URL(request.url);
  const modo = u.searchParams.get('modo');
  const id = parseInt(form.get('id'), 10);
  if (!id) return json({ error: 'Informe o aluno' }, 400);

  if (modo === 'status') {
    const status = ('' + (form.get('status') || '')).trim().slice(0, 30) || 'novo';
    await db.prepare('UPDATE alunos SET status=? WHERE id=?').bind(status, id).run();
    return json({ ok: true });
  }
  if (modo === 'editar') {
    const campo = '' + form.get('campo');
    if (!EDITAVEIS.includes(campo)) return json({ error: 'Campo inválido' }, 400);
    const valor = ('' + (form.get('valor') || '')).trim().slice(0, 300);
    await db.prepare('UPDATE alunos SET ' + campo + '=? WHERE id=?').bind(valor, id).run();
    return json({ ok: true });
  }
  return json({ error: 'Modo inválido' }, 400);
}

export async function onRequestDelete(context) {
  const { env, request } = context;
  const db = env.DB;
  if (!db) return json({ error: 'Banco não configurado' }, 500);
  const u = new URL(request.url);
  if (!auth(env, u.searchParams.get('chave'))) return json({ error: 'Senha incorreta' }, 401);
  const id = parseInt(u.searchParams.get('id'), 10);
  if (!id) return json({ error: 'Informe o aluno' }, 400);
  await db.prepare('DELETE FROM alunos WHERE id=?').bind(id).run();
  return json({ ok: true });
}

function auth(env, chave) {
  const k = env.PUBLISH_KEY;
  return !!k && typeof chave === 'string' && chave === k;
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
