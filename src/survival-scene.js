// 生存模式竞技场渲染：组装 scene.js 导出的绘制函数。
// 地板随时间换色（10 分钟走过六个花园）、精英金环、
// 环绕叶片、荆棘光环、低血量边缘警示都是本文件的增量。
import { WIDTH, HEIGHT } from './world.js?v=5';
import { drawFloor, drawEnemy, drawHero, drawPickup, drawObstacle } from './scene.js?v=7';

function ellipse(ctx, x, y, rx, ry, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); }
function label(ctx, text, x, y, size = 12, color = '#68795c') {
  ctx.fillStyle = color; ctx.font = `${size}px "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y);
}

// 时间 → 花园区域：0-99s 晨露 → 100s 风车 → … → 500s+ 晴空花塔
export function zoneIndexFor(time) { return Math.min(5, Math.floor(time / 100)); }

export function renderArena(ctx, run, images, { reducedMotion = false } = {}) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  const zone = zoneIndexFor(run.time);
  // drawFloor 读取 WORLD[run.room].floor，这里用对应楼层的房间号做调色
  drawFloor(ctx, { room: zone * 5, time: run.time });
  const scene = run.scene;
  for (const o of scene.obstacles) if (o.type === 'water' || o.type === 'spikes') drawObstacle(ctx, o, run);
  if (run.upgrades.aura > 0) drawAura(ctx, run);
  for (const p of scene.pickups) drawPickup(ctx, p, run.time);
  const layers = [
    ...scene.obstacles.filter(o => o.type === 'rock' || o.type === 'crate').map(o => ({ y: o.y + o.h, draw: () => drawObstacle(ctx, o, run) })),
    ...scene.enemies.map(e => ({ y: e.y + 10, draw: () => { drawEnemy(ctx, e, images, run); if (e.elite) drawEliteRing(ctx, e); } })),
    { y: run.hero.y + 10, draw: () => drawHero(ctx, run, images) },
  ].sort((a, b) => a.y - b.y);
  layers.forEach(layer => layer.draw());
  if (run.upgrades.orbit > 0) drawOrbit(ctx, run);
  for (const b of scene.bullets) {
    if (b.owner === 'hero') {
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(Math.atan2(b.vy, b.vx));
      ctx.fillStyle = '#fdf7d9'; ctx.strokeStyle = '#83a078'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-5, -4); ctx.lineTo(-2, 0); ctx.lineTo(-5, 4); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    } else { ellipse(ctx, b.x, b.y, 6, 6, '#e5b56e'); ellipse(ctx, b.x - 1, b.y - 1, 3, 3, '#fff0bb'); }
  }
  if (!reducedMotion) for (const p of scene.particles) { ctx.globalAlpha = Math.max(0, p.life / p.maxLife); ellipse(ctx, p.x, p.y, 2.5, 2, p.color); } ctx.globalAlpha = 1;
  for (const text of scene.texts) { ctx.globalAlpha = Math.min(1, text.life * 3); label(ctx, text.text, text.x, text.y, 12, text.color); } ctx.globalAlpha = 1;
  if (run.status === 'playing' && run.hero.hp < run.hero.maxHp * .3) {
    const pulse = .16 + Math.sin(run.time * 5) * .08;
    const grad = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, HEIGHT * .35, WIDTH / 2, HEIGHT / 2, HEIGHT * .78);
    grad.addColorStop(0, '#c2795500');
    grad.addColorStop(1, `#c27955${Math.round(pulse * 255).toString(16).padStart(2, '0')}`);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
}

function drawEliteRing(ctx, e) {
  ctx.strokeStyle = '#d4ad61'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.arc(e.x, e.y, 24, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  label(ctx, '精英', e.x, e.y - 30, 10, '#d4ad61');
}

function drawAura(ctx, run) {
  const lv = run.upgrades.aura, radius = 42 + 16 * lv, h = run.hero;
  ctx.save();
  ctx.strokeStyle = '#c79c4e99'; ctx.lineWidth = 2.5;
  ctx.setLineDash([7, 6]); ctx.lineDashOffset = -run.time * 26;
  ctx.beginPath(); ctx.arc(h.x, h.y, radius, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#e7c37714'; ctx.beginPath(); ctx.arc(h.x, h.y, radius, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 8; i++) {
    const a = run.time * 1.4 + i * Math.PI / 4, r = radius - 7;
    const px = h.x + Math.cos(a) * r, py = h.y + Math.sin(a) * r;
    ctx.fillStyle = '#c79c4e88';
    ctx.beginPath(); ctx.moveTo(px, py - 6); ctx.lineTo(px + 3, py + 3); ctx.lineTo(px - 3, py + 3); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function drawOrbit(ctx, run) {
  const lv = run.upgrades.orbit, count = 1 + lv, h = run.hero;
  for (let i = 0; i < count; i++) {
    const angle = run.orbitAngle + i * Math.PI * 2 / count;
    for (let echo = 2; echo >= 0; echo--) {
      const a = angle - echo * .22;
      const x = h.x + Math.cos(a) * 62, y = h.y + Math.sin(a) * 62;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a + Math.PI / 2);
      ctx.globalAlpha = echo === 0 ? 1 : .25 / echo;
      ctx.fillStyle = echo === 0 ? '#8fbf7f' : '#b7d9a0';
      ctx.beginPath(); ctx.ellipse(0, 0, 5.5, 11, 0, 0, Math.PI * 2); ctx.fill();
      if (echo === 0) {
        ctx.strokeStyle = '#fffae7'; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.fillStyle = '#e9f5dc'; ctx.beginPath(); ctx.ellipse(0, -3, 2, 4.5, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}
