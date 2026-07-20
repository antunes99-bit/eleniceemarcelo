// GET /api/galeria — lista pública de álbuns da galeria.
// Na primeira chamada, migra o acervo antigo (content/gallery.json) para álbuns por categoria.
const CATS = { destaque:'Destaque', alunos:'Alunos', eventos:'Eventos', aulas:'Aulas', praticas:'Práticas', apresentacoes:'Apresentações', coreografias:'Coreografias', festivais:'Festivais' };

export async function onRequestGet(context) {
  const { env, request } = context;
  const bucket = env.GALERIA;
  if (!bucket) return json({ error: 'R2 não configurado (binding GALERIA ausente)' }, 500);

  let index = await readIndex(bucket);
  if (!index || !index.albums || !index.albums.length) {
    const migrated = await migrateLegacy(context);
    if (migrated.albums.length) {
      // preserva álbuns novos caso existam
      const novos = (index && index.albums) ? index.albums.filter(a => !('' + a.id).startsWith('legado-')) : [];
      index = { albums: [...migrated.albums, ...novos] };
      await bucket.put('index.json', JSON.stringify(index), { httpMetadata: { contentType: 'application/json' } });
    } else if (!index) {
      index = { albums: [] }; // não persiste vazio — tenta de novo na próxima
    }
  }
  return json(index, 200, { 'cache-control': 'public, max-age=60' });
}

async function readIndex(bucket) {
  try {
    const obj = await bucket.get('index.json');
    if (!obj) return null;
    return await obj.json();
  } catch (e) { return null; }
}

async function migrateLegacy(context) {
  const { request, env } = context;
  const origin = new URL(request.url).origin;
  const index = { albums: [] };
  try {
    let r = null;
    if (env.ASSETS && env.ASSETS.fetch) {
      try { r = await env.ASSETS.fetch(new Request(origin + '/content/gallery.json')); } catch (e) { r = null; }
    }
    if (!r || !r.ok) r = await fetch(origin + '/content/gallery.json');
    if (!r.ok) return index;
    const data = await r.json();
    const itens = (data && data.itens) || [];
    const groups = {};
    itens.forEach(it => {
      if (!it.imagem || !('' + it.imagem).trim()) return;
      const c = it.categoria || 'eventos';
      (groups[c] = groups[c] || []).push(it);
    });
    Object.keys(groups).forEach(cat => {
      const items = groups[cat];
      const cover = (items.find(i => i.capa) || items[0]);
      index.albums.push({
        id: 'legado-' + cat,
        titulo: CATS[cat] || cat,
        categoria: cat,
        criado: '2026-06-01T00:00:00Z',
        capa: cover.imagem,
        media: items.map(i => ({ url: i.imagem, legenda: i.legenda || '', video: /\.(mp4|webm|ogg|m4v|mov)$/i.test(i.imagem) }))
      });
    });
  } catch (e) { /* sem legado */ }
  return index;
}

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...extra } });
}
// GET /api/galeria — lista pública de álbuns da galeria.
// Na primeira chamada, migra o acervo antigo (content/gallery.json) para álbuns por categoria.
const CATS = { destaque:'Destaque', alunos:'Alunos', eventos:'Eventos', aulas:'Aulas', praticas:'Práticas', apresentacoes:'Apresentações', coreografias:'Coreografias', festivais:'Festivais' };

export async function onRequestGet(context) {
  const { env, request } = context;
  const bucket = env.GALERIA;
  if (!bucket) return json({ error: 'R2 não configurado (binding GALERIA ausente)' }, 500);

  let index = await readIndex(bucket);
  if (!index) {
    index = await migrateLegacy(request);
    await bucket.put('index.json', JSON.stringify(index), { httpMetadata: { contentType: 'application/json' } });
  }
  // não expor nada sensível; index já é público
  return json(index, 200, { 'cache-control': 'public, max-age=60' });
}

async function readIndex(bucket) {
  try {
    const obj = await bucket.get('index.json');
    if (!obj) return null;
    return await obj.json();
  } catch (e) { return null; }
}

async function migrateLegacy(request) {
  const origin = new URL(request.url).origin;
  const index = { albums: [] };
  try {
    const r = await fetch(origin + '/content/gallery.json');
    if (!r.ok) return index;
    const data = await r.json();
    const itens = (data && data.itens) || [];
    const groups = {};
    itens.forEach(it => {
      if (!it.imagem || !('' + it.imagem).trim()) return;
      const c = it.categoria || 'eventos';
      (groups[c] = groups[c] || []).push(it);
    });
    Object.keys(groups).forEach(cat => {
      const items = groups[cat];
      const cover = (items.find(i => i.capa) || items[0]);
      index.albums.push({
        id: 'legado-' + cat,
        titulo: CATS[cat] || cat,
        categoria: cat,
        criado: '2026-06-01T00:00:00Z',
        capa: cover.imagem,
        media: items.map(i => ({ url: i.imagem, legenda: i.legenda || '', video: /\.(mp4|webm|ogg|m4v|mov)$/i.test(i.imagem) }))
      });
    });
  } catch (e) { /* sem legado */ }
  return index;
}

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...extra } });
}
