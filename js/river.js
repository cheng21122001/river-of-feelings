/* river.js — canvas 河流。逻辑原样自旧版搬来，只是收进一个模块里。
   用法：const river = createRiver({canvas, label, empty}); river.setData(list);
*/

const REDUCE = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

export function createRiver({ canvas, label, empty }) {
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, dpr = 1;
  let grain = null;
  let sceneTheme = "dark";
  let viz = { count: 0, happy: 0, calm: 0, low: 0, sparkles: [], glows: [], bubbles: [] };
  let lastList = [];
  let running = false;

  function readTheme() {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--scene").trim();
    return v === "light" ? "light" : "dark";
  }
  function rng(seed) { let s = seed * 9301 + 49297; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }

  function sizeCanvas() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    if (!W || !H) return;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildGrain();
  }

  function buildGrain() {
    if (!W || !H) return;
    grain = document.createElement("canvas");
    grain.width = Math.max(1, Math.round(W * dpr));
    grain.height = Math.max(1, Math.round(H * dpr));
    const g = grain.getContext("2d");
    const light = sceneTheme === "light";
    const img = g.createImageData(grain.width, grain.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      let v;
      if (light) { v = 196 + Math.random() * 18; if (Math.random() < 0.02) v = 118 + Math.random() * 50; }
      else { v = 7 + Math.random() * 9; if (Math.random() < 0.015) v = 34 + Math.random() * 60; }
      d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    rockPatch(g, W * 0.86, H * 0.06, W * 0.34);
    rockPatch(g, W * 0.92, H * 0.92, W * 0.3);
    rockPatch(g, W * 0.08, H * 1.02, W * 0.24);
  }

  function rockPatch(g, cx, cy, rad) {
    const light = sceneTheme === "light";
    const grd = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
    if (light) {
      grd.addColorStop(0, "rgba(96,94,90,0.42)");
      grd.addColorStop(0.5, "rgba(120,118,112,0.22)");
      grd.addColorStop(1, "rgba(120,118,112,0)");
    } else {
      grd.addColorStop(0, "rgba(150,150,150,0.4)");
      grd.addColorStop(0.5, "rgba(96,96,96,0.22)");
      grd.addColorStop(1, "rgba(96,96,96,0)");
    }
    g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, rad, 0, 7); g.fill();
    g.fillStyle = light ? "rgba(60,58,54,0.5)" : "rgba(210,210,210,0.5)";
    const rnd = rng(Math.round(cx + cy));
    for (let i = 0; i < rad * 1.6; i++) {
      const a = rnd() * 6.28, rr = Math.sqrt(rnd()) * rad;
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      if (rnd() < 0.5) g.fillRect(x, y, 1, 1);
    }
  }

  function centerX(p, t) {
    return W * 0.46 + W * 0.15 * Math.sin(p * Math.PI * 1.5 + 0.5) + W * 0.04 * Math.sin(p * 7 + t * 0.4);
  }

  function setData(list) {
    lastList = list || [];
    if (!W) sizeCanvas();
    const happy = lastList.filter(e => e.mood === "happy").length;
    const calm = lastList.filter(e => e.mood === "calm").length;
    const low = lastList.filter(e => e.mood === "low").length;
    const count = lastList.length;

    const sp = []; const rs = rng(happy * 131 + 7);
    for (let i = 0; i < happy; i++) {
      const p = rs(), side = rs() < 0.5 ? -1 : 1;
      const y = H * (0.1 + p * 0.82);
      const x = centerX(p, 0) + side * (W * 0.16 + rs() * W * 0.28);
      sp.push({ x: Math.max(8, Math.min(W - 8, x)), y, s: 0.9 + rs() * 1.6, ph: rs() * 6.28 });
    }
    const gl = []; const rc = rng(calm * 277 + 3);
    for (let i = 0; i < calm; i++) {
      const p = rc(), side = rc() < 0.5 ? -1 : 1;
      const y = H * (0.12 + p * 0.78);
      const x = centerX(p, 0) + side * (W * 0.1 + rc() * W * 0.26);
      gl.push({ x: Math.max(0, Math.min(W, x)), y, s: 8 + rc() * 14, ph: rc() * 6.28 });
    }
    const bb = []; const rb = rng(low * 613 + 11);
    for (let i = 0; i < low; i++) {
      const p = 0.12 + (i / Math.max(1, low)) * 0.7 + rb() * 0.05;
      bb.push({ p: Math.min(0.92, p), off: (rb() * 2 - 1), s: 1 + rb() * 2, ph: rb() * 6.28 });
    }
    viz = { count, happy, calm, low, sparkles: sp, glows: gl, bubbles: bb };
    if (empty) empty.style.display = count ? "none" : "flex";
    if (label) label.textContent = count ? ("River · " + count + " · " + low + " bottles") : "";
    if (REDUCE) drawFrame(0.7);
  }

  function drawRiver(t) {
    if (!viz.count) return;
    const light = sceneTheme === "light";
    const fill = Math.min(1, viz.count / 22);
    const yTop = H * 0.10;
    const yBot = yTop + (H * 0.84) * Math.max(0.14, fill);
    const maxW = Math.min(W * 0.26, 22 + viz.low * 2.4 + viz.count * 0.6);
    const step = 3;
    ctx.globalCompositeOperation = light ? "source-over" : "lighter";
    for (let y = yTop; y <= yBot; y += step) {
      const p = (y - yTop) / (yBot - yTop);
      const cx = centerX(p, t);
      const wf = Math.pow(Math.sin(p * Math.PI), 0.7);
      const w = maxW * wf * (0.85 + 0.15 * Math.sin(y * 0.08 + t));
      if (w < 1) continue;
      const bnd = 0.55 + 0.45 * Math.sin(p * 16 - t * 2.2);
      const grd = ctx.createLinearGradient(cx - w, y, cx + w, y);
      if (light) {
        grd.addColorStop(0.00, "rgba(0,0,0,0)");
        grd.addColorStop(0.12, "rgba(74,74,78," + (0.12 * bnd) + ")");
        grd.addColorStop(0.30, "rgba(56,56,61," + (0.26 * bnd) + ")");
        grd.addColorStop(0.44, "rgba(40,40,45," + (0.46 * bnd) + ")");
        grd.addColorStop(0.50, "rgba(26,26,31," + (0.56 * (0.6 + 0.4 * bnd)) + ")");
        grd.addColorStop(0.56, "rgba(40,40,45," + (0.46 * bnd) + ")");
        grd.addColorStop(0.72, "rgba(56,56,61," + (0.26 * bnd) + ")");
        grd.addColorStop(0.90, "rgba(74,74,78," + (0.12 * bnd) + ")");
        grd.addColorStop(1.00, "rgba(0,0,0,0)");
      } else {
        const g1 = 200, g2 = 235;
        grd.addColorStop(0.00, "rgba(0,0,0,0)");
        grd.addColorStop(0.12, "rgba(" + g1 + "," + g1 + "," + g1 + "," + (0.30 * bnd) + ")");
        grd.addColorStop(0.30, "rgba(" + g2 + "," + g2 + "," + g2 + "," + (0.60 * bnd) + ")");
        grd.addColorStop(0.44, "rgba(255,255,255," + (0.9 * bnd) + ")");
        grd.addColorStop(0.50, "rgba(255,255,255," + (0.96 * (0.6 + 0.4 * bnd)) + ")");
        grd.addColorStop(0.56, "rgba(255,255,255," + (0.9 * bnd) + ")");
        grd.addColorStop(0.72, "rgba(" + g2 + "," + g2 + "," + g2 + "," + (0.55 * bnd) + ")");
        grd.addColorStop(0.90, "rgba(" + g1 + "," + g1 + "," + g1 + "," + (0.28 * bnd) + ")");
        grd.addColorStop(1.00, "rgba(0,0,0,0)");
      }
      ctx.fillStyle = grd;
      ctx.fillRect(cx - w, y, w * 2, step + 0.6);
    }
    // 湿的高光（仅日间）：中间一条细亮带
    if (light) {
      ctx.globalCompositeOperation = "lighter";
      for (let y = yTop; y <= yBot; y += step) {
        const p = (y - yTop) / (yBot - yTop);
        const cx = centerX(p, t);
        const wf = Math.pow(Math.sin(p * Math.PI), 0.7);
        const w = maxW * wf; if (w < 1) continue;
        const bnd = 0.55 + 0.45 * Math.sin(p * 16 - t * 2.2);
        const sw = Math.max(1, w * 0.16);
        const g2 = ctx.createLinearGradient(cx - sw, y, cx + sw, y);
        g2.addColorStop(0, "rgba(255,255,255,0)");
        g2.addColorStop(0.5, "rgba(255,255,255," + (0.22 * bnd) + ")");
        g2.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g2; ctx.fillRect(cx - sw, y, sw * 2, step + 0.6);
      }
      ctx.globalCompositeOperation = "source-over";
    }
    // 泡沫 / 水珠
    for (const b of viz.bubbles) {
      const y = yTop + (yBot - yTop) * Math.min(1, b.p);
      const cx = centerX(b.p, t);
      const wf = Math.pow(Math.sin(b.p * Math.PI), 0.7);
      const x = cx + b.off * maxW * wf * 0.8;
      const a = 0.5 + 0.5 * Math.sin(t * 1.6 + b.ph);
      ctx.fillStyle = light ? "rgba(20,20,24," + (0.22 + 0.3 * a) + ")" : "rgba(255,255,255," + (0.32 + 0.4 * a) + ")";
      ctx.beginPath(); ctx.arc(x, y, b.s, 0, 7); ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  function drawGlows(t) {
    const light = sceneTheme === "light";
    ctx.globalCompositeOperation = light ? "source-over" : "lighter";
    for (const gm of viz.glows) {
      const a = 0.3 + 0.3 * Math.sin(t * 0.9 + gm.ph);
      const grd = ctx.createRadialGradient(gm.x, gm.y, 0, gm.x, gm.y, gm.s);
      if (light) { grd.addColorStop(0, "rgba(70,70,74," + (a * 0.32) + ")"); grd.addColorStop(1, "rgba(70,70,74,0)"); }
      else { grd.addColorStop(0, "rgba(210,210,210," + (a * 0.55) + ")"); grd.addColorStop(1, "rgba(210,210,210,0)"); }
      ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(gm.x, gm.y, gm.s, 0, 7); ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  function drawSparkles(t) {
    const light = sceneTheme === "light";
    ctx.globalCompositeOperation = light ? "source-over" : "lighter";
    for (const s of viz.sparkles) {
      const a = 0.5 + 0.5 * Math.sin(t * 1.8 + s.ph);
      const grd = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.s * 4);
      if (light) {
        grd.addColorStop(0, "rgba(34,34,38," + (a * 0.32) + ")"); grd.addColorStop(1, "rgba(34,34,38,0)");
        ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(s.x, s.y, s.s * 4, 0, 7); ctx.fill();
        ctx.fillStyle = "rgba(22,22,26," + (0.55 + 0.35 * a) + ")";
      } else {
        grd.addColorStop(0, "rgba(255,255,255," + (a * 0.5) + ")"); grd.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(s.x, s.y, s.s * 4, 0, 7); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255," + (0.6 + 0.4 * a) + ")";
      }
      ctx.beginPath(); ctx.arc(s.x, s.y, s.s * 0.9, 0, 7); ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  function drawVignette() {
    const light = sceneTheme === "light";
    const grd = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.85);
    grd.addColorStop(0, "rgba(0,0,0,0)");
    grd.addColorStop(1, light ? "rgba(90,90,90,0.16)" : "rgba(0,0,0,0.6)");
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
  }

  function drawFrame(t) {
    if (!W) return;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = sceneTheme === "light" ? "#d3d3cd" : "#050505";
    ctx.fillRect(0, 0, W, H);
    if (grain) ctx.drawImage(grain, 0, 0, W, H);
    drawGlows(t); drawRiver(t); drawSparkles(t); drawVignette();
  }

  function loop(ts) { drawFrame((ts || 0) / 1000); requestAnimationFrame(loop); }

  function updateTheme() {
    const nt = readTheme();
    if (nt !== sceneTheme) { sceneTheme = nt; buildGrain(); if (REDUCE) drawFrame(0.7); }
  }

  function resize() {
    sizeCanvas();
    setData(lastList);
    if (REDUCE) drawFrame(0.7);
  }

  function start() {
    if (running) return;
    running = true;
    sceneTheme = readTheme();
    sizeCanvas();
    setData(lastList);
    if (REDUCE) drawFrame(0.7); else requestAnimationFrame(loop);
  }

  return { start, setData, resize, updateTheme, redraw: () => drawFrame(0.7) };
}

export { REDUCE };
