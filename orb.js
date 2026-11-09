/**
 * Audio-reactive glowing canvas Orb for the AI English Speaking Coach
 */
class VoiceOrb {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.state = 'idle'; // 'idle' | 'listening' | 'thinking' | 'speaking'
    this.audioLevel = 0;
    this.targetLevel = 0;
    this.time = 0;
    this.particles = [];
    this.numParticles = 64;

    this.resize();
    window.addEventListener('resize', () => this.resize());

    // Initialize orbital particles
    for (let i = 0; i < this.numParticles; i++) {
      this.particles.push({
        angle: (i / this.numParticles) * Math.PI * 2,
        radiusOffset: (Math.random() - 0.5) * 16,
        speed: 0.01 + Math.random() * 0.015,
        size: 1.5 + Math.random() * 2,
        alpha: 0.3 + Math.random() * 0.5
      });
    }

    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
  }

  setState(newState) {
    this.state = newState;
  }

  setAudioLevel(level) {
    this.targetLevel = Math.min(Math.max(level, 0), 1);
  }

  animate() {
    this.time += 0.03;
    // Smooth level interpolation
    this.audioLevel += (this.targetLevel - this.audioLevel) * 0.2;

    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const cx = w / 2;
    const cy = h / 2;
    const baseRadius = Math.min(w, h) * 0.28;

    ctx.clearRect(0, 0, w, h);

    // Color palettes per state
    let primaryRgb, secondaryRgb, glowRgb;
    let pulseSpeed = 1;

    switch (this.state) {
      case 'listening':
        // Emerald / Cyan
        primaryRgb = '16, 185, 129';
        secondaryRgb = '6, 182, 212';
        glowRgb = '52, 211, 153';
        pulseSpeed = 1.8;
        break;
      case 'thinking':
        // Amber / Violet shimmer
        primaryRgb = '245, 158, 11';
        secondaryRgb = '168, 85, 247';
        glowRgb = '251, 191, 36';
        pulseSpeed = 2.5;
        break;
      case 'speaking':
        // Vibrant Indigo / Blue
        primaryRgb = '79, 70, 229';
        secondaryRgb = '59, 130, 246';
        glowRgb = '129, 140, 248';
        pulseSpeed = 1.5;
        break;
      case 'idle':
      default:
        // Calm Indigo / Cyan
        primaryRgb = '99, 102, 241';
        secondaryRgb = '14, 165, 233';
        glowRgb = '165, 180, 252';
        pulseSpeed = 0.8;
        break;
    }

    const reactive = this.state === 'listening' || this.state === 'speaking'
      ? this.audioLevel * 45
      : 0;

    const currentRadius = baseRadius + Math.sin(this.time * pulseSpeed) * 6 + reactive;

    // 1. Outer Glow Aura
    const auraGradient = ctx.createRadialGradient(cx, cy, currentRadius * 0.3, cx, cy, currentRadius * 2.2);
    auraGradient.addColorStop(0, `rgba(${glowRgb}, 0.25)`);
    auraGradient.addColorStop(0.5, `rgba(${primaryRgb}, 0.12)`);
    auraGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.beginPath();
    ctx.arc(cx, cy, currentRadius * 2.2, 0, Math.PI * 2);
    ctx.fillStyle = auraGradient;
    ctx.fill();

    // 2. Ripple rings for voice activity
    if (this.state === 'listening' || this.state === 'speaking') {
      const ringCount = 3;
      for (let r = 0; r < ringCount; r++) {
        const ringOffset = ((this.time * 0.8 + r / ringCount) % 1);
        const ringRadius = currentRadius + ringOffset * 65;
        const ringAlpha = (1 - ringOffset) * 0.45;

        ctx.beginPath();
        ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${primaryRgb}, ${ringAlpha})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // 3. Main Orb Gradient
    const orbGradient = ctx.createRadialGradient(
      cx - currentRadius * 0.35,
      cy - currentRadius * 0.35,
      currentRadius * 0.1,
      cx,
      cy,
      currentRadius
    );
    orbGradient.addColorStop(0, `rgba(${secondaryRgb}, 0.95)`);
    orbGradient.addColorStop(0.6, `rgba(${primaryRgb}, 0.85)`);
    orbGradient.addColorStop(1, `rgba(15, 23, 42, 0.95)`);

    ctx.beginPath();
    ctx.arc(cx, cy, currentRadius, 0, Math.PI * 2);
    ctx.fillStyle = orbGradient;
    ctx.shadowColor = `rgba(${glowRgb}, 0.8)`;
    ctx.shadowBlur = 30 + reactive * 0.5;
    ctx.fill();
    ctx.shadowBlur = 0;

    // 4. Orbiting Particles
    for (const p of this.particles) {
      p.angle += p.speed * (this.state === 'thinking' ? 2.8 : 1);
      const pr = currentRadius + p.radiusOffset + Math.sin(this.time * 2 + p.angle * 3) * 8 + (reactive * 0.5);
      const px = cx + Math.cos(p.angle) * pr;
      const py = cy + Math.sin(p.angle) * pr;

      ctx.beginPath();
      ctx.arc(px, py, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${glowRgb}, ${p.alpha})`;
      ctx.fill();
    }

    // 5. Specular Highlight for 3D depth
    const highlight = ctx.createRadialGradient(
      cx - currentRadius * 0.35,
      cy - currentRadius * 0.35,
      2,
      cx - currentRadius * 0.35,
      cy - currentRadius * 0.35,
      currentRadius * 0.45
    );
    highlight.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
    highlight.addColorStop(0.5, 'rgba(255, 255, 255, 0.15)');
    highlight.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.beginPath();
    ctx.arc(cx - currentRadius * 0.35, cy - currentRadius * 0.35, currentRadius * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = highlight;
    ctx.fill();

    requestAnimationFrame(this.animate);
  }
}

window.VoiceOrb = VoiceOrb;
