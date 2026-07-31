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
          <div className="ov-title">TAP TO FLY! 🏈</div>
          <div className="ov-sub">
            Tap the screen (or press space) to keep
            <br />
            the ball in the air. Dodge the goalposts! 🥅
          </div>
          <div className="ov-sub">
            🏈 Downs left: <strong>{attemptsLeft}</strong> · Best:{" "}
            <strong>{best}</strong>
          </div>
        </div>
      )}

      {mode === "dead" && (
        <div className="game-overlay">
          <div className="ov-title">
            {wasBest ? "TOUCHDOWN!" : "TACKLED!"}
            <br />
            SCORE: {lastScore}
          </div>
          {wasBest && <div className="new-best">🔥 new personal record 🔥</div>}
          <div className="ov-sub">
            Best: <strong>{Math.max(best, lastScore)}</strong>
          </div>
          {attemptsLeft > 0 ? (
            <button className="btn secondary" onPointerDown={(e) => e.stopPropagation()} onClick={again}>
              🏈 NEXT DOWN ({attemptsLeft} LEFT)
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

  // stadium floodlights (friday night lights!)
  drawFloodlight(ctx, 40, t);
  drawFloodlight(ctx, W - 40, t);

  // parallax clouds
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  for (const c of clouds) {
    const cx = ((c.x - t * 18 * c.s) % (W + 120)) + (((c.x - t * 18 * c.s) % (W + 120)) < -60 ? W + 120 : 0);
    drawCloud(ctx, cx, c.y, c.s);
  }

  // goalposts
  for (const p of run.pipes) {
    drawPost(ctx, p.x, 0, PIPE_W, p.gapY, true);
    drawPost(ctx, p.x, p.gapY + p.gap, PIPE_W, H - GROUND_H - (p.gapY + p.gap), false);
  }

  // turf field
  const gy = H - GROUND_H;
  const scroll = t * 90;
  // mowed bands
  const bandW = 46;
  const bandOff = scroll % (bandW * 2);
  for (let x = -bandW * 2; x < W + bandW * 2; x += bandW) {
    const even = Math.round((x + bandOff) / bandW) % 2 === 0;
    ctx.fillStyle = even ? "#1c7a33" : "#23913e";
    ctx.fillRect(x - bandOff, gy, bandW + 1, GROUND_H);
  }
  // sideline
  ctx.fillStyle = "#f5f5f0";
  ctx.fillRect(0, gy, W, 4);
  // yard lines + hash marks
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  const yardOff = scroll % 92;
  for (let x = -92; x < W + 92; x += 92) {
    ctx.fillRect(x - yardOff, gy + 6, 3, GROUND_H - 10);
  }
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  const hashOff = scroll % 23;
  for (let x = -23; x < W + 23; x += 23) {
    ctx.fillRect(x - hashOff, gy + 22, 2, 7);
    ctx.fillRect(x - hashOff, gy + 44, 2, 7);
  }

  // the football
  const bob = mode === "ready" ? Math.sin(t * 3) * 8 : 0;
  const by = (mode === "ready" ? H / 2 : run.y) + bob;
  const angle =
    mode === "playing" || run.dead
      ? Math.max(-0.5, Math.min(1.1, run.vel / 600))
      : Math.sin(t * 3) * 0.08;
  drawBall(ctx, BIRD_X, by, angle, color);

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

function drawFloodlight(ctx, x, t) {
  // light beam glow
  const beam = ctx.createRadialGradient(x, 26, 4, x, 26, 90);
  beam.addColorStop(0, "rgba(255,250,220,0.35)");
  beam.addColorStop(1, "rgba(255,250,220,0)");
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.arc(x, 26, 90, 0, Math.PI * 2);
  ctx.fill();

  // panel + bulbs
  ctx.fillStyle = "#2a2f4a";
  ctx.fillRect(x - 26, 12, 52, 26);
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 26, 12, 52, 26);
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) {
      const glowPulse = 0.75 + 0.25 * Math.sin(t * 3 + r + c);
      ctx.fillStyle = `rgba(255,248,214,${glowPulse})`;
      ctx.beginPath();
      ctx.arc(x - 15 + c * 15, 20 + r * 11, 4.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // pole up to the top of the frame
  ctx.fillStyle = "#232744";
  ctx.fillRect(x - 3, 0, 6, 14);
}

function drawPost(ctx, x, y, w, h, isTop) {
  if (h <= 0) return;
  const grad = ctx.createLinearGradient(x, 0, x + w, 0);
  grad.addColorStop(0, "#b97e14");
  grad.addColorStop(0.35, "#ffcf4d");
  grad.addColorStop(1, "#a56d0e");
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);

  // crossbar cap at the gap end
  const capH = 20;
  const capY = isTop ? y + h - capH : y;
  ctx.fillStyle = grad;
  ctx.fillRect(x - 6, capY, w + 12, capH);
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 6, capY, w + 12, capH);

  // shine + padded base look
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.fillRect(x + 8, y, 6, h);
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(x + w - 12, y, 8, h);
}

function drawBall(ctx, x, y, angle, color) {
  const RX = 20;
  const RY = 13.5;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // team-color glow so everyone spots their squad's ball
  ctx.shadowColor = color;
  ctx.shadowBlur = 16;

  // pigskin body
  const grad = ctx.createLinearGradient(0, -RY, 0, RY);
  grad.addColorStop(0, "#b05a2a");
  grad.addColorStop(0.5, "#8f4318");
  grad.addColorStop(1, "#6e3010");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(0, 0, RX, RY, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // team-color end stripes (clipped to the ball)
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 0, RX, RY, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = color;
  ctx.fillRect(-RX + 3, -RY, 5, RY * 2);
  ctx.fillRect(RX - 8, -RY, 5, RY * 2);
  ctx.restore();

  // laces
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-8, -3);
  ctx.lineTo(8, -3);
  ctx.stroke();
  for (let i = -6; i <= 6; i += 4) {
    ctx.beginPath();
    ctx.moveTo(i, -6);
    ctx.lineTo(i, 0);
    ctx.stroke();
  }

  ctx.restore();
}
