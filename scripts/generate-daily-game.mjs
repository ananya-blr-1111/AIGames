#!/usr/bin/env node
/**
 * Generate a tiny standalone HTML game for today (Asia/Kolkata),
 * place it under games/YYYY-MM-DD-<slug>/index.html, and rebuild root index.html.
 *
 * Usage:
 *   node scripts/generate-daily-game.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(process.cwd());
const GAMES_DIR = path.join(REPO_ROOT, 'games');

function ensureDir(p){ fs.mkdirSync(p, { recursive: true }); }

function istDateStamp(){
  // Create YYYY-MM-DD in Asia/Kolkata without depending on TZ env.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return fmt.format(new Date()); // en-CA gives YYYY-MM-DD
}

function slugify(s){
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48);
}

const GAME_IDEAS = [
  { title: 'Magnet Runner', slug: 'magnet-runner', desc: 'Pull coins in, avoid spikes. WASD/Arrows, Space burst.' },
  { title: 'Neon Paddle', slug: 'neon-paddle', desc: 'One-paddle pong survival. Move left/right. Don\'t miss.' },
  { title: 'Asteroid Tap', slug: 'asteroid-tap', desc: 'Rotate + thrust, shoot rocks. Arrows + Space.' },
  { title: 'Orbit Collector', slug: 'orbit-collector', desc: 'Stay in orbit and collect sparks. Arrows steer.' },
  { title: 'Tunnel Drift', slug: 'tunnel-drift', desc: 'Dodge walls in a tunnel. A/D or ←/→.' }
];

function pickIdea(dateStamp){
  // Deterministic pick based on date
  let h = 0;
  for(const ch of dateStamp) h = (h*31 + ch.charCodeAt(0)) >>> 0;
  return GAME_IDEAS[h % GAME_IDEAS.length];
}

function gameHtml({ title, dateStamp }){
  // Simple "coin dodger" style game (keyboard), self-contained.
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} (${dateStamp})</title>
  <style>
    :root{color-scheme:dark; --bg:#080b16; --fg:#eef1ff; --muted:#a7b2e6; --accent:#7cf6ff; --danger:#ff4d6d;}
    html,body{height:100%;}
    body{margin:0;display:grid;place-items:center;background:radial-gradient(900px 600px at 50% 35%, #111c44 0%, var(--bg) 60%);color:var(--fg);font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;}
    .wrap{width:min(980px,94vw);}
    .top{display:flex;gap:12px;justify-content:space-between;flex-wrap:wrap;align-items:flex-start;margin-bottom:10px;}
    .panel{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);border-radius:14px;padding:12px 14px;backdrop-filter: blur(6px);}
    h1{font-size:18px;margin:0 0 6px;}
    .muted{color:var(--muted);font-size:13px;line-height:1.35;}
    .stats{display:flex;gap:10px;flex-wrap:wrap;font-size:13px;color:var(--muted)}
    .stats b{color:var(--fg);font-weight:650}
    canvas{width:100%;aspect-ratio:16/9;background:linear-gradient(180deg, rgba(0,0,0,.30), rgba(0,0,0,.65));border:1px solid rgba(255,255,255,.14);border-radius:16px;display:block;}
    .btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;}
    button{cursor:pointer;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);color:var(--fg);padding:8px 10px;border-radius:12px;font-weight:600}
    button:hover{background:rgba(255,255,255,.12)}
    .hint{font-size:12px;color:var(--muted);margin-top:8px}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div class="panel" style="flex:1;min-width:260px">
        <h1>${title}</h1>
        <div class="muted">
          Collect coins (+1). Avoid bombs (-1 life). Speed ramps up.
          <br/>Controls: <b>WASD</b>/<b>Arrow keys</b> move • <b>R</b> restart • <b>P</b> pause
        </div>
      </div>
      <div class="panel" style="min-width:260px">
        <div class="stats">
          <div>Score: <b id="score">0</b></div>
          <div>Lives: <b id="lives">3</b></div>
          <div>Best: <b id="best">0</b></div>
          <div>Time: <b id="time">0.0</b>s</div>
        </div>
        <div class="hint">Tip: small arcs beat zig-zagging.</div>
      </div>
    </div>

    <canvas id="c" width="1280" height="720"></canvas>

    <div class="btns">
      <button id="restart">Restart (R)</button>
      <button id="pause">Pause/Resume (P)</button>
    </div>

    <div class="hint">Folder date: ${dateStamp}. Standalone HTML game (no build step).</div>
  </div>

<script>
(() => {
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const W = () => canvas.width;
  const H = () => canvas.height;

  const elScore = document.getElementById('score');
  const elLives = document.getElementById('lives');
  const elBest  = document.getElementById('best');
  const elTime  = document.getElementById('time');

  const keys = new Set();
  addEventListener('keydown', (e) => {
    keys.add(e.key.toLowerCase());
    if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(e.key.toLowerCase())) e.preventDefault();
    if(e.key.toLowerCase()==='r') reset();
    if(e.key.toLowerCase()==='p') paused = !paused;
  }, {passive:false});
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

  document.getElementById('restart').onclick = () => reset();
  document.getElementById('pause').onclick = () => paused = !paused;

  const rand = (a,b) => a + Math.random()*(b-a);
  const clamp = (v,a,b) => Math.max(a, Math.min(b, v));

  const LS = 'dailyBest_${dateStamp.replaceAll('-','')}';
  let best = +localStorage.getItem(LS) || 0;
  elBest.textContent = best;

  let score = 0;
  let lives = 3;
  let t0 = performance.now();
  let last = t0;
  let elapsed = 0;
  let paused = false;
  let gameOver = false;

  const player = { x: 0, y: 0, r: 18, spd: 520 };
  const items = []; // {x,y,r,vy,type}

  function spawn(){
    const type = Math.random() < 0.75 ? 'coin' : 'bomb';
    items.push({
      x: rand(40, W()-40),
      y: -30,
      r: type==='coin'? 14 : 16,
      vy: rand(220, 360) + elapsed*6,
      type
    });
  }

  function reset(){
    score = 0;
    lives = 3;
    elapsed = 0;
    t0 = last = performance.now();
    paused = false;
    gameOver = false;
    items.length = 0;
    player.x = W()/2;
    player.y = H()*0.78;
    syncUI();
  }

  function syncUI(){
    elScore.textContent = score;
    elLives.textContent = lives;
    elTime.textContent = elapsed.toFixed(1);
    elBest.textContent = best;
  }

  function update(dt){
    if(paused || gameOver) return;
    elapsed += dt;

    // movement
    let ax = 0, ay = 0;
    if(keys.has('a')||keys.has('arrowleft')) ax -= 1;
    if(keys.has('d')||keys.has('arrowright')) ax += 1;
    if(keys.has('w')||keys.has('arrowup')) ay -= 1;
    if(keys.has('s')||keys.has('arrowdown')) ay += 1;
    const mag = Math.hypot(ax,ay) || 1;
    ax/=mag; ay/=mag;
    const spd = player.spd * (1 + Math.min(1.2, elapsed/40));
    player.x = clamp(player.x + ax*spd*dt, 20, W()-20);
    player.y = clamp(player.y + ay*spd*dt, 20, H()-20);

    // spawn ramp
    const spawnRate = 0.65 + Math.min(2.2, elapsed/18);
    if(Math.random() < dt*spawnRate) spawn();

    // items
    for(const it of items){
      it.y += it.vy*dt;
    }

    // collisions + cull
    for(let i=items.length-1;i>=0;i--){
      const it = items[i];
      if(it.y > H()+60){ items.splice(i,1); continue; }
      const dx = it.x - player.x, dy = it.y - player.y;
      if(dx*dx + dy*dy < (it.r + player.r)**2){
        if(it.type==='coin') score += 1;
        else lives -= 1;
        items.splice(i,1);
        if(lives <= 0){
          gameOver = true;
          if(score > best){ best = score; localStorage.setItem(LS, String(best)); }
        }
      }
    }

    syncUI();
  }

  function draw(){
    ctx.clearRect(0,0,W(),H());

    // background grid
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.strokeStyle = 'rgba(124,246,255,0.35)';
    for(let x=0;x<=W();x+=80){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H()); ctx.stroke(); }
    for(let y=0;y<=H();y+=80){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W(),y); ctx.stroke(); }
    ctx.restore();

    // items
    for(const it of items){
      if(it.type==='coin'){
        ctx.fillStyle = 'rgba(255, 230, 120, 0.95)';
        ctx.shadowColor = 'rgba(255,230,120,0.65)';
        ctx.shadowBlur = 16;
      } else {
        ctx.fillStyle = 'rgba(255, 77, 109, 0.95)';
        ctx.shadowColor = 'rgba(255,77,109,0.65)';
        ctx.shadowBlur = 18;
      }
      ctx.beginPath(); ctx.arc(it.x,it.y,it.r,0,Math.PI*2); ctx.fill();
      ctx.shadowBlur = 0;
    }

    // player
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.fillStyle = 'rgba(231,245,255,0.95)';
    ctx.shadowColor = 'rgba(124,246,255,0.8)';
    ctx.shadowBlur = 18;
    ctx.beginPath(); ctx.arc(0,0,player.r,0,Math.PI*2); ctx.fill();
    ctx.restore();

    if(paused && !gameOver) overlay('Paused', 'Press P to resume');
    if(gameOver) overlay('Game Over', 'Score: ' + score + '  •  Best: ' + best + '  •  Press R to restart');
  }

  function overlay(title, subtitle){
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0,0,W(),H());
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.textAlign = 'center';
    ctx.font = '700 56px system-ui, -apple-system, Segoe UI, Roboto, Arial';
    ctx.fillText(title, W()/2, H()/2 - 10);
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.font = '500 18px system-ui, -apple-system, Segoe UI, Roboto, Arial';
    ctx.fillText(subtitle, W()/2, H()/2 + 34);
    ctx.restore();
  }

  function loop(){
    const t = performance.now();
    const dt = Math.min(0.04, (t - last)/1000);
    last = t;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  reset();
  requestAnimationFrame(loop);
})();
</script>
</body>
</html>`;
}

function rebuildRootIndex(entries){
  // Newest first
  const sorted = [...entries].sort((a,b) => b.date.localeCompare(a.date));
  const cards = sorted.map(e => {
    const href = `games/${e.folder}/`;
    return `
    <div class="card">
      <h2 style="margin:0 0 6px">${e.date} — ${escapeHtml(e.title)}</h2>
      <p style="margin:0 0 10px;color:var(--muted)">${escapeHtml(e.desc)}</p>
      <a href="${href}">Play →</a>
    </div>`;
  }).join('\n');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AIGames</title>
  <style>
    :root{color-scheme:dark; --bg:#0b1020; --fg:#e7ecff; --muted:#9aa7d6; --card:#121a33; --link:#9ad1ff;}
    body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:var(--bg);color:var(--fg);}
    .wrap{max-width:900px;margin:0 auto;padding:32px 16px;}
    h1{margin:0 0 8px;}
    p{margin:0 0 20px;color:var(--muted);}
    .card{background:var(--card);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:16px;margin:12px 0;}
    a{color:var(--link);text-decoration:none;}
    a:hover{text-decoration:underline;}
    code{background:rgba(255,255,255,.06);padding:2px 6px;border-radius:6px;}
  </style>
</head>
<body>
  <div class="wrap">
    <h1>AIGames</h1>
    <p>Daily tiny HTML games. Open a folder in <code>games/</code> and click <code>index.html</code>. (Tip: enable GitHub Pages to make this a launcher.)</p>
${cards}
  </div>
</body>
</html>`;

  fs.writeFileSync(path.join(REPO_ROOT, 'index.html'), html, 'utf8');
}

function escapeHtml(s){
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

function readExistingEntries(){
  ensureDir(GAMES_DIR);
  const entries = [];
  for(const name of fs.readdirSync(GAMES_DIR)){
    const full = path.join(GAMES_DIR, name);
    if(!fs.statSync(full).isDirectory()) continue;

    // folder starts with YYYY-MM-DD-
    const m = name.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
    if(!m) continue;
    const date = m[1];

    // best-effort read: first <title>
    const idx = path.join(full, 'index.html');
    if(!fs.existsSync(idx)) continue;
    const txt = fs.readFileSync(idx, 'utf8');
    const tm = txt.match(/<title>([^<]+)<\/title>/i);
    const title = tm ? tm[1].replace(/\s*\([^)]*\)\s*$/, '') : name;
    entries.push({ date, folder: name, title, desc: 'Open to see controls.' });
  }
  return entries;
}

function main(){
  const dateStamp = istDateStamp();
  const idea = pickIdea(dateStamp);

  // If any game already exists for today (YYYY-MM-DD-*), do not create a second one.
  ensureDir(GAMES_DIR);
  const existingToday = fs.readdirSync(GAMES_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name.startsWith(dateStamp + '-'))
    .map(d => d.name)[0];

  const folder = existingToday ?? `${dateStamp}-${slugify(idea.title)}`;
  const outDir = path.join(GAMES_DIR, folder);
  const outIndex = path.join(outDir, 'index.html');
  const outReadme = path.join(outDir, 'README.md');

  ensureDir(outDir);

  if(existingToday){
    console.log(`Found existing game for today: games/${folder}/ (no new game created)`);
  } else {
    fs.writeFileSync(outIndex, gameHtml({ title: idea.title, dateStamp }), 'utf8');
    fs.writeFileSync(outReadme, `# ${dateStamp} — ${idea.title}\n\n${idea.desc}\n\nControls are shown in-game.\n`, 'utf8');
    console.log(`Created: games/${folder}/index.html`);
  }

  const entries = readExistingEntries();
  // Add description for today's entry if we created it (or if it matches our computed folder)
  for(const e of entries){
    if(e.folder === folder){ e.desc = existingToday ? 'Open to see controls.' : idea.desc; }
  }
  rebuildRootIndex(entries);
  console.log('Rebuilt: index.html');
}

main();
