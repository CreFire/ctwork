import { useEffect, useRef } from "react";

/** 全局星空背景:视差星层 + 偶发流星 */
export default function StarCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;

    interface Star {
      x: number;
      y: number;
      z: number;
      r: number;
      t: number;
    }
    interface Meteor {
      x: number;
      y: number;
      vx: number;
      vy: number;
      life: number;
    }
    let stars: Star[] = [];
    let meteor: Meteor | null = null;
    let meteorCd = 5;

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      cv.width = w * dpr;
      cv.height = h * dpr;
      cv.style.width = w + "px";
      cv.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.floor((w * h) / 7500);
      stars = Array.from({ length: n }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        z: Math.random(),
        r: 0.3 + Math.random() * 1.3,
        t: Math.random() * 7,
      }));
    };
    resize();
    window.addEventListener("resize", resize);

    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      ctx.clearRect(0, 0, w, h);

      // 星云薄雾
      const neb = ctx.createRadialGradient(w * 0.78, h * 0.18, 0, w * 0.78, h * 0.18, w * 0.5);
      neb.addColorStop(0, "rgba(34,211,238,0.045)");
      neb.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = neb;
      ctx.fillRect(0, 0, w, h);
      const neb2 = ctx.createRadialGradient(w * 0.12, h * 0.85, 0, w * 0.12, h * 0.85, w * 0.4);
      neb2.addColorStop(0, "rgba(167,139,250,0.04)");
      neb2.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = neb2;
      ctx.fillRect(0, 0, w, h);

      for (const s of stars) {
        s.t += dt * (0.8 + s.z * 2.4);
        s.x -= dt * (1.5 + s.z * 7);
        if (s.x < -4) {
          s.x = w + 4;
          s.y = Math.random() * h;
        }
        const tw = 0.55 + 0.45 * Math.sin(s.t);
        ctx.globalAlpha = (0.2 + s.z * 0.8) * tw;
        ctx.fillStyle = s.z > 0.85 ? "#d9f3ff" : s.z > 0.5 ? "#9fb6d8" : "#5b6c85";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * (0.6 + s.z), 0, 7);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // 流星
      meteorCd -= dt;
      if (!meteor && meteorCd <= 0) {
        meteorCd = 6 + Math.random() * 10;
        const my = Math.random() * h * 0.45;
        meteor = { x: w * (0.3 + Math.random() * 0.7), y: my, vx: -(420 + Math.random() * 300), vy: 140 + Math.random() * 120, life: 1 };
      }
      if (meteor) {
        meteor.x += meteor.vx * dt;
        meteor.y += meteor.vy * dt;
        meteor.life -= dt * 0.9;
        if (meteor.life <= 0 || meteor.x < -80) meteor = null;
        else {
          const grad = ctx.createLinearGradient(meteor.x, meteor.y, meteor.x - meteor.vx * 0.16, meteor.y - meteor.vy * 0.16);
          grad.addColorStop(0, `rgba(190,240,255,${0.9 * meteor.life})`);
          grad.addColorStop(1, "rgba(190,240,255,0)");
          ctx.strokeStyle = grad;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(meteor.x, meteor.y);
          ctx.lineTo(meteor.x - meteor.vx * 0.16, meteor.y - meteor.vy * 0.16);
          ctx.stroke();
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={ref} className="pointer-events-none fixed inset-0 -z-10" />;
}
