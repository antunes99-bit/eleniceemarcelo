// GET /media/<caminho> — serve arquivos do R2 (fotos e vídeos), com suporte a Range (seek de vídeo).
export async function onRequestGet(context) {
  const { env, params, request } = context;
  const bucket = env.GALERIA;
  if (!bucket) return new Response('R2 não configurado', { status: 500 });
  const key = Array.isArray(params.path) ? params.path.map(decodeURIComponent).join('/') : decodeURIComponent(params.path || '');
  if (!key || key === 'index.json') return new Response('Não encontrado', { status: 404 });

  const rangeHeader = request.headers.get('range');
  let obj;
  if (rangeHeader) {
    const m = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
    if (m) {
      const start = m[1] === '' ? undefined : parseInt(m[1], 10);
      const end = m[2] === '' ? undefined : parseInt(m[2], 10);
      let range;
      if (start !== undefined && end !== undefined) range = { offset: start, length: end - start + 1 };
      else if (start !== undefined) range = { offset: start };
      else if (end !== undefined) range = { suffix: end };
      obj = await bucket.get(key, { range });
      if (obj === null) return new Response('Não encontrado', { status: 404 });
      const size = obj.size;
      const offset = range.offset !== undefined ? range.offset : Math.max(0, size - range.suffix);
      const length = range.length !== undefined ? Math.min(range.length, size - offset) : size - offset;
      const headers = baseHeaders(obj, key);
      headers.set('content-range', 'bytes ' + offset + '-' + (offset + length - 1) + '/' + size);
      headers.set('content-length', '' + length);
      return new Response(obj.body, { status: 206, headers });
    }
  }
  obj = await bucket.get(key);
  if (obj === null) return new Response('Não encontrado', { status: 404 });
  const headers = baseHeaders(obj, key);
  headers.set('content-length', '' + obj.size);
  return new Response(obj.body, { status: 200, headers });
}

function baseHeaders(obj, key) {
  const h = new Headers();
  const ct = (obj.httpMetadata && obj.httpMetadata.contentType) || guessType(key);
  h.set('content-type', ct);
  h.set('accept-ranges', 'bytes');
  h.set('cache-control', 'public, max-age=31536000, immutable');
  if (obj.httpEtag) h.set('etag', obj.httpEtag);
  return h;
}
function guessType(key) {
  const ext = (key.split('.').pop() || '').toLowerCase();
  const map = { jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', webp:'image/webp', gif:'image/gif', heic:'image/heic', mp4:'video/mp4', m4v:'video/mp4', mov:'video/quicktime', webm:'video/webm', ogg:'video/ogg', mp3:'audio/mpeg' };
  return map[ext] || 'application/octet-stream';
}
