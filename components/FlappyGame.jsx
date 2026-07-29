"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const W = 400;
const H = 600;
const GROUND_H = 70;
const BIRD_X = 110;
const BIRD_R = 15;
const GRAVITY = 1650;
const FLAP_V = -440;
const MAX_FALL = 720;
const PIPE_W = 66;

function makeAudio() {
  let ctx = null;
  const ensure = () => {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    }
    if (ctx && ctx.state === "suspended") ctx.resume();
    return ctx;
  };
  const tone = (freq, endFreq, dur, type = "square", vol = 0.06) => {
    const c = ensure();
    if (!c) return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(1, endFreq),
      c.currentTime + dur
    );
    gain.gain.setValueAtTime(vol, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    osc.connect(gain).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + dur);
  };
  return {
    unlock: ensure,
    flap: () => tone(500, 800, 0.09, "square", 0.045),
    point: () => tone(880, 1320, 0.14, "sine", 0.07),
    hit: () => tone(220, 40, 0.35, "sawtooth", 0.09),
  };
}

function freshRun() {
  return {
    y: H / 2,
    vel: 0,
    pipes: [],
    score: 0,
    spawnIn: 0.9,
    wing: 0,
    shake: 0,
    flash: 0,
    dead: false,
  };
}

export default function FlappyGame({
  color = "#FFD700",
  attemptsLeft,
  best,
  onRunEnd,
  onFinished,
}) {
  const canvasRef = useRef(null);
  const [mode, setMode] = useState("ready"); // ready | playing | dead
  const modeRef = useRef("ready");
  const [lastScore, setLastScore] = useState(0);
  const [wasBest, setWasBest] = useState(false);
  const runRef = useRef(freshRun());
  const audioRef = useRef(null);
  const cloudsRef = useRef(
    Array.from({ length: 5 }, (_, i) => ({
      x: (i * 137) % W,
      y: 40 + ((i * 83) % 200),
      s: 0.6 + ((i * 31) % 10) / 12,
    }))
  );
  const bestRef = useRef(best);
  bestRef.current = best;

  const setModeBoth = (m) => {
    modeRef.current = m;
    setMode(m);
  };

  const die = useCallback(() => {
    const run = runRef.current;
    if (run.dead) return;
    run.dead = true;
    run.shake = 0.4;
    run.flash = 0.25;
    audioRef.current?.hit();
    setLastScore(run.score);
    setWasBest(run.score > (bestRef.current || 0));
    setModeBoth("dead");
    onRunEnd?.(run.score);
  }, [onRunEnd]);

  const flap = useCallback(() => {
    if (!audioRef.current) audioRef.current = makeAudio();
    audioRef.current.unlock();
    if (modeRef.current === "ready") {
      runRef.current = freshRun();
      runRef.current.vel = FLAP_V;
      setModeBoth("playing");
      audioRef.current.flap();
    } else if (modeRef.current === "playing") {
      runRef.current.vel = FLAP_V;
      audioRef.current.flap();
      runRef.current.wing = 0.18;
    }
  }, []);

  // input
  useEffect(() => {
    const onKey = (e) => {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        flap();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flap]);

  // main loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    let raf;
    let last = performance.now();
    let idleT = 0;

    const step = (now) => {
      const dt = Math.min(0.04, (now - last) / 1000);
      last = now;
      idleT += dt;
      const run = runRef.current;

      if (modeRef.current === "playing") {
        run.vel = Math.min(MAX_FALL, run.vel + GRAVITY * dt);
        run.y += run.vel * dt;
        run.wing = Math.max(0, run.wing - dt);

        const speed = Math.min(265, 155 + run.score * 2);
        const gap = Math.max(138, 168 - run.score);

        run.spawnIn -= dt;
        if (run.spawnIn <= 0) {
          run.spawnIn = 235 / speed;
          const margin = 70;
          const gapY =
            margin +
            Math.random() * (H - GROUND_H - margin * 2 - gap);
          run.pipes.push({ x: W + 10, gapY, gap, passed: false });
        }

        for (const p of run.pipes) p.x -= speed * dt;
        run.pipes = run.pipes.filter((p) => p.x > -PIPE_W - 20);

        // scoring + collisions
        for (const p of run.pipes) {
          if (!p.passed && p.x + PIPE_W < BIRD_X - BIRD_R) {
            p.passed = true;
            run.score += 1;
            audioRef.current?.point();
          }
          const withinX =
            BIRD_X + BIRD_R > p.x && BIRD_X - BIRD_R < p.x + PIPE_W;
          if (
            withinX &&
            (run.y - BIRD_R < p.gapY || run.y + BIRD_R > p.gapY + p.gap)
          ) {
            die();
          }
        }
        if (run.y + BIRD_R >= H - GROUND_H) {
          run.y = H - GROUND_H - BIRD_R;
          die();
        }
        if (run.y - BIRD_R < 0) {
          run.y = BIRD_R;
          run.vel = 40;
        }
      }

      run.shake = Math.max(0, run.shake - dt);
      run.flash = Math.max(0, run.flash - dt);

      draw(ctx, run, idleT, color, modeRef.current, cloudsRef.current);
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [color, die]);

  const again = () => {
    runRef.current = freshRun();
    setModeBoth("ready");
  };

  return (
    <div className="canvas-holder" onPointerDown={mode !== "dead" ? flap : undefined}>
      <canvas ref={canvasRef} style={{ aspectRatio: `${W} / ${H}` }} />

      {mode === "ready" && (
        <div className="game-overlay" onPointerDown={flap}>
          <div className="ov-title">TAP TO FLAP!</div>
          <div className="ov-sub">
            Tap the screen (or press space) to fly.
            <br />
            Don&apos;t hit the pipes! 🟢
          </div>
          <div className="ov-sub">
            ❤️ Attempts left: <strong>{attemptsLeft}</strong> · Best:{" "}
            <strong>{best}</strong>
          </div>
        </div>
      )}

      {mode === "dead" && (
        <div className="game-overlay">
          <div className="ov-title">
            {wasBest ? "NEW BEST!" : "OUCH!"}
            <br />
            SCORE: {lastScore}
          </div>
          {wasBest && <div className="new-best">🔥 personal record 🔥</div>}
          <div className="ov-sub">
            Best: <strong>{Math.max(best, lastScore)}</strong>
          </div>
          {attemptsLeft > 0 ? (
            <button className="btn secondary" onPointerDown={(e) => e.stopPropagation()} onClick={again}>
              🐤 FLY AGAIN ({attemptsLeft} LEFT)
            </button>
          ) : (
            <button className="btn" onClick={() => onFinished?.()}>
              🏁 SEE RESULTS
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------- drawing ---------------- */

function draw(ctx, run, t, color, mode, clouds) {
  ctx.save();
  if (run.shake > 0) {
    ctx.translate(
      (Math.random() - 0.5) * run.shake * 24,
      (Math.random() - 0.5) * run.shake * 24
    );
  }

  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#141b46");
  sky.addColorStop(0.55, "#3b2f7d");
  sky.addColorStop(0.85, "#8a4d9e");
  sky.addColorStop(1, "#d96f6f");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // stars
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  for (let i = 0; i < 24; i++) {
    const sx = (i * 61) % W;
    const sy = (i * 47) % (H / 2);
    const tw = 0.5 + 0.5 * Math.sin(t * 2 + i);
    ctx.globalAlpha = 0.25 + tw * 0.5;
    ctx.fillRect(sx, sy, 2, 2);
  }
  ctx.globalAlpha = 1;

  // moon
  ctx.fillStyle = "#ffe9a8";
  ctx.beginPath();
  ctx.arc(330, 80, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,233,168,0.15)";
  ctx.beginPath();
  ctx.arc(330, 80, 40, 0, Math.PI * 2);
  ctx.fill();

  // parallax clouds
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  for (const c of clouds) {
    const cx = ((c.x - t * 18 * c.s) % (W + 120)) + (((c.x - t * 18 * c.s) % (W + 120)) < -60 ? W + 120 : 0);
    drawCloud(ctx, cx, c.y, c.s);
  }

  // pipes
  for (const p of run.pipes) {
    drawPipe(ctx, p.x, 0, PIPE_W, p.gapY, true);
    drawPipe(ctx, p.x, p.gapY + p.gap, PIPE_W, H - GROUND_H - (p.gapY + p.gap), false);
  }

  // ground
  const gy = H - GROUND_H;
  ctx.fillStyle = "#1c1638";
  ctx.fillRect(0, gy, W, GROUND_H);
  ctx.fillStyle = "#00e5cc";
  ctx.fillRect(0, gy, W, 4);
  ctx.fillStyle = "rgba(0,229,204,0.18)";
  const scroll = (t * 90) % 34;
  for (let x = -34; x < W + 34; x += 34) {
    ctx.beginPath();
    ctx.moveTo(x - scroll, gy + 8);
    ctx.lineTo(x - scroll + 16, gy + 8);
    ctx.lineTo(x - scroll + 6, GROUND_H + gy - 8);
    ctx.lineTo(x - scroll - 10, GROUND_H + gy - 8);
    ctx.closePath();
    ctx.fill();
  }

  // bird
  const bob = mode === "ready" ? Math.sin(t * 3) * 8 : 0;
  const by = (mode === "ready" ? H / 2 : run.y) + bob;
  const angle =
    mode === "playing" || run.dead
      ? Math.max(-0.5, Math.min(1.1, run.vel / 600))
      : Math.sin(t * 3) * 0.08;
  drawBird(ctx, BIRD_X, by, angle, color, run.wing > 0 || mode === "ready" ? Math.sin(t * 20) : 0.6);

  // score
  if (mode === "playing" || run.dead) {
    ctx.font = "700 44px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.strokeText(String(run.score), W / 2, 70);
    ctx.fillStyle = "#fff";
    ctx.fillText(String(run.score), W / 2, 70);
  }

  // hit flash
  if (run.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${run.flash * 2.4})`;
    ctx.fillRect(0, 0, W, H);
  }

  ctx.restore();
}

function drawCloud(ctx, x, y, s) {
  ctx.beginPath();
  ctx.arc(x, y, 18 * s, 0, Math.PI * 2);
  ctx.arc(x + 20 * s, y - 8 * s, 14 * s, 0, Math.PI * 2);
  ctx.arc(x + 40 * s, y, 16 * s, 0, Math.PI * 2);
  ctx.fill();
}

function drawPipe(ctx, x, y, w, h, isTop) {
  if (h <= 0) return;
  const grad = ctx.createLinearGradient(x, 0, x + w, 0);
  grad.addColorStop(0, "#1f8a4c");
  grad.addColorStop(0.35, "#3ddc84");
  grad.addColorStop(1, "#166b3a");
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);

  // lip
  const lipH = 22;
  const lipY = isTop ? y + h - lipH : y;
  ctx.fillStyle = grad;
  ctx.fillRect(x - 5, lipY, w + 10, lipH);
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 5, lipY, w + 10, lipH);

  // shine
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.fillRect(x + 8, y, 6, h);
}

function drawBird(ctx, x, y, angle, color, wingPhase) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, BIRD_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // belly
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath();
  ctx.arc(-2, 6, BIRD_R * 0.55, 0, Math.PI * 2);
  ctx.fill();

  // wing
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(-5, 0, 9, 5.5, -0.5 + wingPhase * 0.5, 0, Math.PI * 2);
  ctx.fill();

  // eye
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(6, -5, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(7.5, -5, 2.4, 0, Math.PI * 2);
  ctx.fill();

  // beak
  ctx.fillStyle = "#ff9f1a";
  ctx.beginPath();
  ctx.moveTo(12, 0);
  ctx.lineTo(22, 3);
  ctx.lineTo(12, 7);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}
