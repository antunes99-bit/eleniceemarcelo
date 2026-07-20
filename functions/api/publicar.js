// POST /api/publicar — cria um álbum (lote de fotos/vídeos com legenda única).
//   multipart/form-data: titulo, categoria, chave, arquivos (vários "file")
//   Também aceita ?modo=arquivo para subir 1 arquivo por vez em um álbum já criado (albumId).
// DELETE /api/publicar?album=<id>&chave=<senha> — exclui um álbum inteiro.
// Autenticação: senha definida na variável de ambiente PUBLISH_KEY (Pages → Settings).

const MAX_FILE = 200 * 1024 * 1024; // 200 MB por arquivo (R2 aguenta; aviso na UI)

export async function onRequestPost(context) {
  const { env, request } = context;
  const bucket = env.GALERIA;
  if (!bucket) return json({ error: 'R2 não configurado' }, 500);
  const form = await request.formData();
  if (!auth(env, form.get('chave'))) return json({ error: 'Senha incorreta' }, 401);

  const modo = new URL(request.url).searchParams.get('modo');

  if (modo === 'arquivo') {
    // sobe um arquivo para um álbum existente
    const albumId = sanitize(form.get('albumId') || '');
    const f = form.get('file');
    if (!albumId || !f || typeof f === 'string') return json({ error: 'Dados incompletos' }, 400);
    if (f.size > MAX_FILE) return json({ error: 'Arquivo acima de 200 MB' }, 413);
    const nome = sanitize(f.name || 'arquivo');
    const key = 'albums/' + albumId + '/' + Date.now() + '-' + nome;
    await bucket.put(key, f.stream(), { httpMetadata: { contentType: f.type || 'application/octet-stream' } });
    const idx = await readIndex(bucket);
    const alb = idx.albums.find(a => a.id === albumId);
    if (!alb) return json({ error: 'Álbum não encontrado' }, 404);
    const url = '/media/' + key;
    alb.media.push({ url, legenda: '', video: isVid(nome) || (f.type || '').startsWith('video/') });
    if (!alb.capa && !isVid(nome)) alb.capa = url;
    if (!alb.capa) alb.capa = url;
    await saveIndex(bucket, idx);
    return json({ ok: true, url, total: alb.media.length });
  }

  if (modo === 'editar') {
    // edita título/categoria/capa de um álbum
    const albumId = sanitize(form.get('albumId') || '');
    const idx = await readIndex(bucket);
    const alb = idx.albums.find(a => a.id === albumId);
    if (!alb) return json({ error: 'Álbum não encontrado' }, 404);
    const titulo = ('' + (form.get('titulo') || '')).trim().slice(0, 120);
    const categoria = sanitize(form.get('categoria') || '');
    const capa = ('' + (form.get('capa') || '')).trim();
    if (titulo) alb.titulo = titulo;
    if (categoria) alb.categoria = categoria;
    if (capa && alb.media.some(m => m.url === capa)) alb.capa = capa;
    await saveIndex(bucket, idx);
    return json({ ok: true });
  }

  if (modo === 'removerItem') {
    // remove uma foto/vídeo específico de um álbum
    const albumId = sanitize(form.get('albumId') || '');
    const url = ('' + (form.get('url') || '')).trim();
    const idx = await readIndex(bucket);
    const alb = idx.albums.find(a => a.id === albumId);
    if (!alb) return json({ error: 'Álbum não encontrado' }, 404);
    const item = alb.media.find(m => m.url === url);
    if (!item) return json({ error: 'Item não encontrado' }, 404);
    alb.media = alb.media.filter(m => m.url !== url);
    if (url.startsWith('/media/')) { try { await bucket.delete(url.slice('/media/'.length)); } catch (e) {} }
    if (alb.capa === url) alb.capa = (alb.media.find(m => !m.video) || alb.media[0] || {}).url || '';
    if (!alb.media.length) idx.albums = idx.albums.filter(a => a.id !== albumId);
    await saveIndex(bucket, idx);
    return json({ ok: true, restam: alb.media.length });
  }

  if (modo === 'concluir') {
    return json({ ok: true });
  }

  // criar álbum novo (sem arquivos ainda)
  // validação anti-bot (Turnstile) — ativa quando TURNSTILE_SECRET estiver configurado
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
      if (!vj.success) return json({ error: 'Verificação anti-robô falhou. Recarregue a página.' }, 403);
    } catch (e) { /* em caso de indisponibilidade do verificador, segue com a senha */ }
  }
  const titulo = ('' + (form.get('titulo') || '')).trim().slice(0, 120);
  const categoria = sanitize(form.get('categoria') || 'eventos') || 'eventos';
  const categoriaNova = ('' + (form.get('categoriaNova') || '')).trim().slice(0, 40);
  if (!titulo) return json({ error: 'Dê um título/legenda ao lote' }, 400);
  const id = slug(titulo) + '-' + Date.now().toString(36);
  const idx = await readIndex(bucket);
  if (categoriaNova) { idx.categorias = idx.categorias || {}; idx.categorias[categoria] = categoriaNova; }
  idx.albums.push({ id, titulo, categoria, criado: new Date().toISOString(), capa: '', media: [] });
  await saveIndex(bucket, idx);
  return json({ ok: true, albumId: id });
}

export async function onRequestDelete(context) {
  const { env, request } = context;
  const bucket = env.GALERIA;
  if (!bucket) return json({ error: 'R2 não configurado' }, 500);
  const u = new URL(request.url);
  if (!auth(env, u.searchParams.get('chave'))) return json({ error: 'Senha incorreta' }, 401);
  const albumId = sanitize(u.searchParams.get('album') || '');
  if (!albumId) return json({ error: 'Informe o álbum' }, 400);
  const idx = await readIndex(bucket);
  const alb = idx.albums.find(a => a.id === albumId);
  if (!alb) return json({ error: 'Álbum não encontrado' }, 404);
  // apaga objetos do R2 (apenas os que moram no R2)
  for (const m of alb.media) {
    if (m.url && m.url.startsWith('/media/')) {
      try { await bucket.delete(m.url.slice('/media/'.length)); } catch (e) {}
    }
  }
  idx.albums = idx.albums.filter(a => a.id !== albumId);
  await saveIndex(bucket, idx);
  return json({ ok: true });
}

function auth(env, chave) {
  const k = env.PUBLISH_KEY;
  return !!k && typeof chave === 'string' && chave === k;
}
async function readIndex(bucket) {
  const obj = await bucket.get('index.json');
  if (!obj) return { albums: [] };
  try { return await obj.json(); } catch (e) { return { albums: [] }; }
}
async function saveIndex(bucket, idx) {
  await bucket.put('index.json', JSON.stringify(idx), { httpMetadata: { contentType: 'application/json' } });
}
const isVid = s => /\.(mp4|webm|ogg|m4v|mov)$/i.test(s || '');
const sanitize = s => ('' + s).replace(/[^a-zA-Z0-9à-üÀ-Ü ()\[\]._-]/g, '').trim();
const slug = s => ('' + s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'album';
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}
