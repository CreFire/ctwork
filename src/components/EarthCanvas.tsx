import { useEffect, useRef } from "react";

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 程序化地球:大陆、晨昏线、随解体进度扩展的熔岩裂谷与环绕方舟 */
export default function EarthCanvas({ progress, size = 300 }: { progress: number; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const progRef = useRef(progress);
  useEffect(() => {
    progRef.current = progress;
  }, [progress]);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = size * dpr;
    cv.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cx = size / 2;
    const cy = size / 2;
    const R = size * 0.31;

    const rand = mulberry32(2077);
    // 大陆板块(伪随机器簇)
    const blobs = Array.from({ length: 10 }, () => {
      const a = rand() * Math.PI * 2;
      const rr = rand() * R * 0.6;
      return { x: Math.cos(a) * rr, y: Math.sin(a) * rr, s: R * (0.13 + rand() * 0.2), n: 6, seed: rand() * 100 };
    }).map((b) =>
      Array.from({ length: b.n }, (_, i) => {
        const aa = (i / b.n) * 2.4 + b.seed;
        const rad = b.s * (0.35 + ((Math.sin(b.seed + i * 3.7) + 1) / 2) * 0.65);
        return { x: b.x + Math.cos(aa) * rad, y: b.y + Math.sin(aa) * rad };
      })
    );
    // 熔岩裂谷
    const cracks = Array.from({ length: 14 }, (_, ci) => {
      const a = rand() * Math.PI * 2;
      const segs = 5 + Math.floor(rand() * 4);
      const pts = [{ x: Math.cos(a) * R * 0.96, y: Math.sin(a) * R * 0.96 }];
      let px = pts[0].x;
      let py = pts[0].y;
      const step = R * (0.08 + rand() * 0.09);
      for (let i = 1; i <= segs; i++) {
        const wob = (rand() - 0.5) * R * 0.16;
        px += -Math.cos(a) * step + wob;
        py += -Math.sin(a) * step + wob;
        pts.push({ x: px, y: py });
      }
      return { pts, threshold: 0.52 + (ci / 14) * 0.42 };
    });

    let t = 0;
    let last = performance.now();
    let raf = 0;

    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      t += dt;
      const p = progRef.current;
      ctx.clearRect(0, 0, size, size);

      // 大气光晕
      const haloCol = p < 0.6 ? "34,211,238" : p < 0.85 ? "251,146,60" : "248,113,113";
      const halo = ctx.createRadialGradient(cx, cy, R * 0.92, cx, cy, R * 1.6);
      halo.addColorStop(0, `rgba(${haloCol},${0.22 + p * 0.14})`);
      halo.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.6, 0, 7);
      ctx.fill();

      // 行星本体(光源在左上)
      const g = ctx.createRadialGradient(cx - R * 0.45, cy - R * 0.5, R * 0.12, cx, cy, R * 1.08);
      g.addColorStop(0, "#206095");
      g.addColorStop(0.45, "#10395f");
      g.addColorStop(1, "#050e1d");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, 7);
      ctx.fill();

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R - 0.5, 0, 7);
      ctx.clip();

      // 大陆(缓慢自转)
      ctx.translate(cx, cy);
      ctx.rotate(t * 0.018);
      for (const pts of blobs) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.closePath();
        ctx.fillStyle = "rgba(39,121,80,0.8)";
        ctx.fill();
      }
      ctx.rotate(-t * 0.018);
      ctx.translate(-cx, -cy);

      // 晨昏线(夜半球)
      const night = ctx.createLinearGradient(cx - R * 1.2, cy - R * 1.2, cx + R * 0.9, cy + R * 0.9);
      night.addColorStop(0.55, "rgba(2,6,17,0)");
      night.addColorStop(0.8, "rgba(2,6,17,0.75)");
      night.addColorStop(1, "rgba(2,6,17,0.92)");
      ctx.fillStyle = night;
      ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

      // 裂谷
      for (const c of cracks) {
        if (p <= c.threshold) continue;
        const k = Math.min(1, (p - c.threshold) / 0.16);
        const pulse = 0.8 + 0.2 * Math.sin(t * 3 + c.threshold * 20);
        ctx.beginPath();
        const lim = Math.max(2, Math.ceil(c.pts.length * k));
        ctx.moveTo(cx + c.pts[0].x, cy + c.pts[0].y);
        for (let i = 1; i < lim; i++) ctx.lineTo(cx + c.pts[i].x, cy + c.pts[i].y);
        ctx.strokeStyle = `rgba(255,${118 + Math.floor(70 * k)},44,${(0.3 + 0.6 * k) * pulse})`;
        ctx.lineWidth = 0.8 + 1.7 * k;
        ctx.shadowColor = "rgba(255,92,0,0.95)";
        ctx.shadowBlur = 9 * k;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // 地核辉光
      if (p > 0.55) {
        const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.85);
        cg.addColorStop(0, `rgba(255,122,40,${Math.min(0.55, (p - 0.55) * 1.2)})`);
        cg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.arc(cx, cy, R * 0.85, 0, 7);
        ctx.fill();
      }
      ctx.restore();

      // 边缘光
      ctx.strokeStyle = "rgba(150,224,255,0.28)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, 7);
      ctx.stroke();

      // 方舟轨道(椭圆透视)
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-0.14);
      ctx.scale(1, 0.36);
      ctx.strokeStyle = "rgba(103,232,249,0.2)";
      ctx.setLineDash([2, 5]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, R * 1.5, 0, 7);
      ctx.stroke();
      ctx.setLineDash([]);
      const ang = t * 0.5;
      const ox = Math.cos(ang) * R * 1.5;
      const oy = Math.sin(ang) * R * 1.5;
      // 尾迹
      const trail = ctx.createLinearGradient(ox, oy, ox - Math.cos(ang - 0.55) * R * 1.5, oy - Math.sin(ang - 0.55) * R * 1.5);
      trail.addColorStop(0, "rgba(103,232,249,0.85)");
      trail.addColorStop(1, "rgba(103,232,249,0)");
      ctx.strokeStyle = trail;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(0, 0, R * 1.5, ang - 0.5, ang);
      ctx.stroke();
      // 方舟本体
      ctx.fillStyle = "#cffafe";
      ctx.shadowColor = "rgba(34,211,238,0.95)";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(ox, oy, 2.4, 0, 7);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  return <canvas ref={ref} style={{ width: size, height: size }} className="mx-auto block" />;
}
