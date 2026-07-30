"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_ATTEMPTS, TD_YARDS, YARDS_PER_GATE } from "@/lib/teams";

const W = 400;
const H = 600;
const GROUND_H = 70;
const BIRD_X = 110;
const BIRD_R = 15;
const GRAVITY = 1650;
const FLAP_V = -440;
const MAX_FALL = 720;
const PIPE_W = 66;

// UNC Charlotte palette for the canvas
const C = {
  skyTop: "#03231a",
  skyMid: "#05402c",
  skyLow: "#0a6b45",
  horizon: "#c8b06a",
  turfDark: "#004a30",
  turfLight: "#00603d",
  gold: "#a49665",
  goldBright: "#d4bd7d",
  goldDark: "#6f6340",
};

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
  const touchdown = () => {
    const c = ensure();
    if (!c) return;
    // stadium horn fanfare: C-E-G-C arpeggio with a held final note
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "triangle";
      const t0 = c.currentTime + i * 0.13;
      const hold = i === notes.length - 1 ? 0.7 : 0.16;
      osc.frequency.setValueAtTime(f, t0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.1, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + hold);
      osc.connect(gain).connect(c.destination);
      osc.start(t0);
      osc.stop(t0 + hold + 0.05);
    });
    // crowd roar: filtered noise swell
    const dur = 1.6;
    const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const filter = c.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 900;
    filter.Q.value = 0.6;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.07, c.currentTime + 0.25);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    src.connect(filter).connect(gain).connect(c.destination);
    src.start();
  };
  return {
    unlock: ensure,
    flap: () => tone(500, 800, 0.09, "square", 0.045),
    point: () => tone(880, 1320, 0.14, "sine", 0.07),
    hit: () => tone(220, 40, 0.35, "sawtooth", 0.09),
    touchdown,
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
    tdFlash: 0,
    dead: false,
  };
}

export default function FlappyGame({
  color = "#a49665",
  attemptsLeft,
  driveYards,
  touchdowns,
  onRunEnd,
  onFinished,
}) {
  const canvasRef = useRef(null);
  const [mode, setMode] = useState("ready"); // ready | playing | dead | td
  const modeRef = useRef("ready");
  const [lastGates, setLastGates] = useState(0);
  const [result, setResult] = useState(null); // server truth after a run
  const runRef = useRef(freshRun());
  const audioRef = useRef(null);
  const cloudsRef = useRef(
    Array.from({ length: 5 }, (_, i) => ({
      x: (i * 137) % W,
      y: 40 + ((i * 83) % 200),
      s: 0.6 + ((i * 31) % 10) / 12,
    }))
  );
  const driveRef = useRef(driveYards);
  driveRef.current = driveYards;

  const setModeBoth = (m) => {
    modeRef.current = m;
    setMode(m);
  };

  const finishRun = useCallback(
    async (isTd) => {
      const run = runRef.current;
      if (run.dead) return;
      run.dead = true;
      if (isTd) {
        run.tdFlash = 0.6;
        audioRef.current?.touchdown();
        setModeBoth("td");
      } else {
        run.shake = 0.4;
        run.flash = 0.25;
        audioRef.current?.hit();
        setModeBoth("dead");
      }
      setLastGates(run.score);
      setResult(null);
      const res = await onRunEnd?.(run.score);
      if (res) setResult(res);
    },
    [onRunEnd]
  );

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
            // crossed the goal line mid-run → touchdown, right now!
            if (
              driveRef.current + run.score * YARDS_PER_GATE >= TD_YARDS
            ) {
              audioRef.current?.point();
              finishRun(true);
              break;
            }
            audioRef.current?.point();
          }
          const withinX =
            BIRD_X + BIRD_R > p.x && BIRD_X - BIRD_R < p.x + PIPE_W;
          if (
            withinX &&
            (run.y - BIRD_R < p.gapY || run.y + BIRD_R > p.gapY + p.gap)
          ) {
            finishRun(false);
          }
        }
        if (run.y + BIRD_R >= H - GROUND_H) {
          run.y = H - GROUND_H - BIRD_R;
          finishRun(false);
        }
        if (run.y - BIRD_R < 0) {
          run.y = BIRD_R;
          run.vel = 40;
        }
      }

      run.shake = Math.max(0, run.shake - dt);
      run.flash = Math.max(0, run.flash - dt);
      run.tdFlash = Math.max(0, run.tdFlash - dt);

      draw(
        ctx,
        run,
        idleT,
        color,
        modeRef.current,
        cloudsRef.current,
        driveRef.current
      );
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [color, finishRun]);

  const again = () => {
    runRef.current = freshRun();
    setResult(null);
    setModeBoth("ready");
  };

  const gainedYards = lastGates * YARDS_PER_GATE;
  // fall back to local math until the server response lands
  const remaining =
    result != null
      ? Math.max(0, MAX_ATTEMPTS - result.attempts)
      : Math.max(0, attemptsLeft - 1);
  const driveNow =
    result != null
      ? result.yards
      : Math.min(TD_YARDS - YARDS_PER_GATE, driveYards + gainedYards);
  const tdCount = result != null ? result.touchdowns : touchdowns;

  const continueButtons = (label) =>
    remaining > 0 ? (
      <button
        className="btn secondary"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={again}
      >
        {label} ({remaining} LEFT)
      </button>
    ) : (
      <button className="btn" onClick={() => onFinished?.()}>
        🏁 DRIVE OVER — SEE RESULTS
      </button>
    );

  return (
    <div className="canvas-holder" onPointerDown={mode === "ready" || mode === "playing" ? flap : undefined}>
      <canvas ref={canvasRef} style={{ aspectRatio: `${W} / ${H}` }} />

      {mode === "ready" && (
        <div className="game-overlay" onPointerDown={flap}>
          <div className="ov-title">TAP TO SNAP! 🏈</div>
          <div className="ov-sub">
            Tap (or press space) to keep the ball flying.
            <br />
            Every gate you clear = <strong>{YARDS_PER_GATE} yards</strong>.
          </div>
          <div className="drive-chip">
            DRIVE: <strong>{driveYards}</strong> / {TD_YARDS} YDS
          </div>
          <div className="ov-sub">
            🏈 Attempts left: <strong>{attemptsLeft}</strong> · TDs:{" "}
            <strong>{touchdowns}</strong>
          </div>
        </div>
      )}

      {mode === "td" && (
        <div className="game-overlay td-overlay">
          <div className="td-burst" aria-hidden="true">
            {Array.from({ length: 24 }, (_, i) => (
              <i key={i} style={{ "--i": i }} />
            ))}
          </div>
          <div className="td-ball">🏈</div>
          <div className="td-title">TOUCHDOWN!</div>
          <div className="td-sub">
            {TD_YARDS}-YARD DRIVE COMPLETE — SIX POINTS!
          </div>
          <div className="td-count">
            YOUR TDs: <strong>{tdCount}</strong>
          </div>
          {continueButtons("🏈 NEW DRIVE")}
        </div>
      )}

      {mode === "dead" && (
        <div className="game-overlay">
          <div className="ov-title">
            TACKLED!
            <br />
            +{gainedYards} YDS
          </div>
          <div className="drive-chip">
            DRIVE: <strong>{driveNow}</strong> / {TD_YARDS} YDS
          </div>
          {gainedYards > 0 && remaining > 0 && (
            <div className="ov-sub">
              Your yards carry over — next attempt picks up right here! 💪
            </div>
          )}
          {continueButtons("🏈 NEXT ATTEMPT")}
        </div>
      )}
    </div>
  );
}

/* ---------------- drawing ---------------- */

function draw(ctx, run, t, color, mode, clouds, driveYards) {
  ctx.save();
  if (run.shake > 0) {
    ctx.translate(
      (Math.random() - 0.5) * run.shake * 24,
      (Math.random() - 0.5) * run.shake * 24
    );
  }

  // Charlotte-green game-day sky with a gold horizon glow
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, C.skyTop);
  sky.addColorStop(0.5, C.skyMid);
  sky.addColorStop(0.82, C.skyLow);
  sky.addColorStop(1, C.horizon);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // stadium floodlights
  drawFloodlight(ctx, 40, t);
  drawFloodlight(ctx, W - 40, t);

  // parallax clouds
  ctx.fillStyle = "rgba(255,255,255,0.1)";
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
  // mowed bands in Charlotte green
  const bandW = 46;
  const bandOff = scroll % (bandW * 2);
  for (let x = -bandW * 2; x < W + bandW * 2; x += bandW) {
    const even = Math.round((x + bandOff) / bandW) % 2 === 0;
    ctx.fillStyle = even ? C.turfDark : C.turfLight;
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

  // drive meter across the top: how close is this drive to the end zone?
  const liveYards = Math.min(
    TD_YARDS,
    driveYards + run.score * YARDS_PER_GATE
  );
  const meterW = W - 60;
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  roundRect(ctx, 30, 14, meterW, 12, 6);
  ctx.fill();
  if (liveYards > 0) {
    const fill = ctx.createLinearGradient(30, 0, 30 + meterW, 0);
    fill.addColorStop(0, C.gold);
    fill.addColorStop(1, C.goldBright);
    ctx.fillStyle = fill;
    roundRect(ctx, 30, 14, Math.max(8, meterW * (liveYards / TD_YARDS)), 12, 6);
    ctx.fill();
  }
  ctx.font = "800 13px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff";
  ctx.fillText(`DRIVE ${liveYards} / ${TD_YARDS} YDS`, W / 2, 44);

  // yards gained this attempt
  if (mode === "playing" || run.dead) {
    ctx.font = "800 44px system-ui, sans-serif";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    const label = `+${run.score * YARDS_PER_GATE}`;
    ctx.strokeText(label, W / 2, 96);
    ctx.fillStyle = C.goldBright;
    ctx.fillText(label, W / 2, 96);
  }

  // hit flash (white) / touchdown flash (gold)
  if (run.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${run.flash * 2.4})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (run.tdFlash > 0) {
    ctx.fillStyle = `rgba(212,189,125,${run.tdFlash * 1.4})`;
    ctx.fillRect(0, 0, W, H);
  }

  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
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
  beam.addColorStop(0, "rgba(255,250,220,0.32)");
  beam.addColorStop(1, "rgba(255,250,220,0)");
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.arc(x, 26, 90, 0, Math.PI * 2);
  ctx.fill();

  // panel + bulbs
  ctx.fillStyle = "#0b3324";
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
  ctx.fillStyle = "#082a1e";
  ctx.fillRect(x - 3, 0, 6, 14);
}

function drawPost(ctx, x, y, w, h, isTop) {
  if (h <= 0) return;
  const grad = ctx.createLinearGradient(x, 0, x + w, 0);
  grad.addColorStop(0, C.goldDark);
  grad.addColorStop(0.35, C.goldBright);
  grad.addColorStop(1, "#5d5335");
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
