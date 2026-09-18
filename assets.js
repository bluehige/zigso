/** Read the user's ZIP directly; no external CDN, upload service, or manual extraction. */
const TITLES = ['첫 번째 만남','햇살을 닮은 미소','오후의 약속','잠깐의 쉬는 시간','느긋한 저녁','창가의 이야기','소소한 일상','다시 만난 미소','설레는 한 장','마지막 장면'];
function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ -1) >>> 0;
}
export async function unpackImages(buffer) {
  const view = new DataView(buffer), bytes = new Uint8Array(buffer);
  let end = -1;
  for (let p = bytes.length - 22; p >= Math.max(0, bytes.length - 65557); p--) if (view.getUint32(p, true) === 0x06054b50) { end = p; break; }
  if (end < 0) throw new Error('이미지 ZIP 파일의 형식이 올바르지 않습니다.');
  const count = view.getUint16(end + 10, true); let p = view.getUint32(end + 16, true);
  if (count > 300) throw new Error('이미지 팩의 파일 수가 너무 많습니다.');
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== 0x02014b50) throw new Error('손상된 ZIP 목록입니다.');
    const flags = view.getUint16(p+8,true), method = view.getUint16(p+10,true), crc = view.getUint32(p+16,true), compressed = view.getUint32(p+20,true), size = view.getUint32(p+24,true), length = view.getUint16(p+28,true), extra = view.getUint16(p+30,true), comment = view.getUint16(p+32,true), offset = view.getUint32(p+42,true);
    const name = new TextDecoder().decode(bytes.subarray(p+46,p+46+length));
    p += 46 + length + extra + comment;
    if (!/\.(jpg|jpeg|png|webp)$/i.test(name) || name.includes('__MACOSX') || /\/\._/.test(name)) continue;
    if (flags & 1 || size > 16000000 || offset + 30 > bytes.length) throw new Error('지원하지 않는 이미지 파일입니다.');
    const start = offset + 30 + view.getUint16(offset+26,true) + view.getUint16(offset+28,true);
    if (view.getUint32(offset,true) !== 0x04034b50 || start + compressed > bytes.length) throw new Error('손상된 이미지입니다.');
    entries.push({ name, method, crc, size, start, compressed });
  }
  if (!entries.length || entries.length > 100 || entries.reduce((a,e)=>a+e.size,0) > 100000000) throw new Error('사용할 수 있는 이미지 팩이 아닙니다.');
  entries.sort((a,b)=>a.name.split('/').pop().localeCompare(b.name.split('/').pop(),undefined,{numeric:true}));
  const result = [];
  for (const entry of entries) {
    let raw = bytes.slice(entry.start, entry.start + entry.compressed);
    if (entry.method === 8) {
      let ds;
      try { ds = new DecompressionStream('deflate-raw'); } catch { throw new Error('브라우저 업데이트가 필요합니다. 최신 Chrome 또는 Safari로 열어주세요.'); }
      raw = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(ds)).arrayBuffer());
    } else if (entry.method !== 0) throw new Error('지원하지 않는 ZIP 압축 방식입니다.');
    if (raw.length !== entry.size || crc32(raw) !== entry.crc) throw new Error('이미지가 손상되었습니다. 새로고침해 다시 받아주세요.');
    const ext = entry.name.split('.').pop().toLowerCase();
    const blob = new Blob([raw], {type: ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'});
    result.push({ original: entry.name.split('/').pop(), blob });
  }
  return result;
}
async function thumbnail(blob, fallback) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(blob);
    const c = document.createElement('canvas'); c.width=324; c.height=Math.round(324*bitmap.height/bitmap.width);
    c.getContext('2d').drawImage(bitmap,0,0,c.width,c.height);
    return c.toDataURL('image/webp',.8);
  } catch { return fallback; } finally { bitmap?.close(); }
}
export async function loadStages(report = () => {}) {
  report(3,'이미지 팩을 확인하고 있어요.');
  const url = new URL('./동급생.zip', import.meta.url).href;
  let response, cache;
  try { cache = await caches.open('zigso-original-art-v1'); response = await cache.match(url); } catch { /* Private mode: network still works. */ }
  if (!response) {
    const controller = new AbortController(), timeout = setTimeout(()=>controller.abort(),60000);
    try { response = await fetch(url,{signal:controller.signal}); } finally { clearTimeout(timeout); }
    if (!response.ok) throw new Error(`이미지 팩을 불러오지 못했습니다 (${response.status}). 잠시 후 다시 시도해주세요.`);
    if (cache) cache.put(url,response.clone()).catch(()=>{});
  }
  const reader = response.body?.getReader(), chunks = []; let received=0, buffer;
  const total = Number(response.headers.get('content-length')) || 8573546;
  if (reader) {
    while (true) { const {done,value}=await reader.read(); if(done) break; chunks.push(value);received+=value.length;if(received>35000000) throw new Error('이미지 팩의 크기가 너무 큽니다.');report(Math.min(65,5+received/total*60),'이미지 팩을 불러오고 있어요.'); }
    const merged=new Uint8Array(received);let pos=0;for(const chunk of chunks){merged.set(chunk,pos);pos+=chunk.length;}buffer=merged.buffer;
  } else buffer=await response.arrayBuffer();
  report(68,'10개의 장면을 펼치고 있어요.');
  let images;
  try { images=await unpackImages(buffer); } catch(error){try{await cache?.delete(url);}catch{}throw error;}
  const stages=[];
  for(let i=0;i<images.length;i++){
    const image=images[i],src=URL.createObjectURL(image.blob);
    stages.push({id:i,title:TITLES[i]||`장면 ${i+1}`,src,thumb:await thumbnail(image.blob,src),original:image.original});
    report(72+(i+1)/images.length*28,`장면 준비 중 · ${i+1} / ${images.length}`);
  }
  return stages;
}
