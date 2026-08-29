// POST /api/matricula — cadastro público de aluno (form da página /matricula).
// Proteções: anti-bot Turnstile (quando TURNSTILE_SECRET existir) + honeypot + limite de tamanho.
// Banco: D1 (binding DB). A tabela é criada automaticamente na primeira matrícula.

const CAMPOS = ['nome','cpf','nascimento','whatsapp','email','endereco','turma','emergencia_nome','emergencia_fone','saude','cobranca_nome','cobranca_email','cobranca_whatsapp'];

export async function onRequestPost(context) {
  const { env, request } = context;
  const db = env.DB;
  if (!db) return json({ error: 'Banco de dados não configurado' }, 500);
  const form = await request.formData();

  // honeypot: campo invisível que humanos não preenchem
  if (('' + (form.get('site') || '')).trim() !== '') return json({ ok: true });

  // anti-bot Turnstile
  if (env.TURNSTILE_SECRET) {
    const ts = form.get('ts');
    if (!ts) return json({ error: 'Complete a verificação "não sou um robô"' }, 403);
    try {
      const vr = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'secret=' + encodeURIComponent(env.TURNSTILE_SECRET) + '&response=' + encodeURIComponent(ts)
      });
      const vj = await vr.json();
      if (!vj.success) {
        const cods = (vj['error-codes'] || []).join(', ') || 'sem código';
        return json({ error: 'Verificação anti-robô falhou (' + cods + ').' }, 403);
      }
    } catch (e) { /* verificador indisponível: segue */ }
  }

  const d = {};
  for (const c of CAMPOS) d[c] = ('' + (form.get(c) || '')).trim().slice(0, 300);
  if (!d.nome || d.nome.length < 3) return json({ error: 'Informe o nome completo' }, 400);
  if (d.cpf.replace(/\D/g, '').length !== 11) return json({ error: 'Informe um CPF válido (11 números)' }, 400);
  if (!d.whatsapp || d.whatsapp.replace(/\D/g, '').length < 10) return json({ error: 'Informe um WhatsApp válido com DDD' }, 400);
  if (!d.turma) return json({ error: 'Escolha a turma' }, 400);
  if (form.get('consentimento') !== 'sim') return json({ error: 'É preciso autorizar o uso dos dados para a matrícula' }, 400);

  await criarTabela(db);
  await db.prepare(
    'INSERT INTO alunos (criado, status, nome, cpf, nascimento, whatsapp, email, endereco, turma, emergencia_nome, emergencia_fone, saude, cobranca_nome, cobranca_email, cobranca_whatsapp) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ).bind(
    new Date().toISOString(), 'novo',
    d.nome, d.cpf, d.nascimento, d.whatsapp, d.email, d.endereco, d.turma,
    d.emergencia_nome, d.emergencia_fone, d.saude,
    d.cobranca_nome, d.cobranca_email, d.cobranca_whatsapp
  ).run();

  return json({ ok: true });
}

async function criarTabela(db) {
  await db.prepare(
    'CREATE TABLE IF NOT EXISTS alunos (' +
    'id INTEGER PRIMARY KEY AUTOINCREMENT,' +
    'criado TEXT NOT NULL,' +
    "status TEXT DEFAULT 'novo'," +
    'nome TEXT NOT NULL,' +
    'cpf TEXT,' +
    'nascimento TEXT,' +
    'whatsapp TEXT NOT NULL,' +
    'email TEXT,' +
    'endereco TEXT,' +
    'turma TEXT NOT NULL,' +
    'emergencia_nome TEXT,' +
    'emergencia_fone TEXT,' +
    'saude TEXT,' +
    'cobranca_nome TEXT,' +
    'cobranca_email TEXT,' +
    'cobranca_whatsapp TEXT)'
  ).run();
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}
