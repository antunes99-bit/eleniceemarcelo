// Preview por evento no WhatsApp / redes — Open Graph dinâmico.
// Rota: /e/<slug>  ->  monta a prévia com o cartaz do evento e redireciona pro site.
function slugify(s){return (s||'').toString().normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60);}
function esc(s){return (s||'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
const isVid=s=>/\.(mp4|webm|ogg|m4v|mov)$/i.test(s||'');

export async function onRequestGet(context){
  const { params, request } = context;
  const origin = new URL(request.url).origin;
  const slug = params.slug;
  const siteName = 'Escola de Dança Elenice & Marcelo';
  const siteImg = origin + '/uploads/Fotocard%20Sambapel.jpg';
  let title = siteName, desc = 'Dança de salão em Pelotas/RS. Não precisa ter par.', img = siteImg;
  try{
    const r = await fetch(origin + '/content/mural.json', { cf: { cacheTtl: 60 } });
    if(r.ok){
      const data = await r.json();
      const itens = (data && data.itens) || [];
      const it = itens.find(x => slugify(x.titulo) === slug);
      if(it){
        title = it.titulo || siteName;
        desc = (it.texto || it.data || desc).toString().replace(/\s+/g,' ').trim().slice(0,170);
        if(it.imagem && !isVid(it.imagem)){
          img = /^https?:/i.test(it.imagem) ? it.imagem : origin + encodeURI(it.imagem.startsWith('/') ? it.imagem : '/'+it.imagem);
        }
      }
    }
  }catch(e){}
  const dest = origin + '/?recado=' + encodeURIComponent(slug) + '#mural';
  const html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<title>'+esc(title)+'</title>'
    + '<meta property="og:type" content="article">'
    + '<meta property="og:site_name" content="'+esc(siteName)+'">'
    + '<meta property="og:title" content="'+esc(title)+'">'
    + '<meta property="og:description" content="'+esc(desc)+'">'
    + '<meta property="og:image" content="'+esc(img)+'">'
    + '<meta property="og:url" content="'+esc(dest)+'">'
    + '<meta name="twitter:card" content="summary_large_image">'
    + '<meta name="twitter:title" content="'+esc(title)+'">'
    + '<meta name="twitter:description" content="'+esc(desc)+'">'
    + '<meta name="twitter:image" content="'+esc(img)+'">'
    + '<link rel="canonical" href="'+esc(dest)+'">'
    + '<meta http-equiv="refresh" content="0; url='+esc(dest)+'">'
    + '</head><body>'+'<scr'+'ipt>location.replace('+JSON.stringify(dest)+');</scr'+'ipt>'
    + '<p>Redirecionando para o evento… <a href="'+esc(dest)+'">abrir no site</a>.</p></body></html>';
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=120' } });
}
