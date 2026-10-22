/* ════════════════════════════════════════════════════════════════════
   BioGeneX Labs · app.js
   ────────────────────────────────────────────────────────────────────
   Arquitectura (la página funciona aunque GSAP/Lenis no carguen):
   · Núcleo sin dependencias: preloader, ADN en canvas, tabs, FAQ, chat,
     formulario → WhatsApp, estado "abierto ahora", reveals (IntersectionObserver)
   · Capa de scroll (GSAP + ScrollTrigger + Lenis): imagen que se abre,
     scroll horizontal de servicios, texto que se ilumina, parallax.
   · Todo respeta prefers-reduced-motion.
   ════════════════════════════════════════════════════════════════════ */
(() => {
    'use strict';

    /* ───────── Utilidades ───────── */
    const $ = (s, c = document) => c.querySelector(s);
    const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
    const root = document.documentElement;
    const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const FINE_POINTER = matchMedia('(hover: hover) and (pointer: fine)').matches;
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
    const easeOutExpo = t => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

    const WA_NUMBER = '529242030780'; // 924 203 0780 (el número con ícono de WhatsApp en el flyer)
    const waLink = text => `https://wa.me/${WA_NUMBER}` + (text ? `?text=${encodeURIComponent(text)}` : '');

    let lenis = null;
    const HAS_GSAP = !!(window.gsap && window.ScrollTrigger) && !REDUCE;

    /* ───────── 1. Enlaces de WhatsApp con mensaje prellenado ───────── */
    function setupWhatsApp() {
        $$('[data-wa]').forEach(a => { a.href = waLink(a.dataset.wa); });
    }

    /* ───────── 2. Utilidades de texto ───────── */
    // Divide un título en palabras con máscara (revelado palabra por palabra)
    function splitMasked(el) {
        let idx = 0;
        const walk = node => {
            Array.from(node.childNodes).forEach(n => {
                if (n.nodeType === 3) {
                    const frag = document.createDocumentFragment();
                    n.textContent.split(/(\s+)/).forEach(part => {
                        if (!part) return;
                        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
                        const outer = document.createElement('span');
                        outer.className = 'sw';
                        const inner = document.createElement('span');
                        inner.className = 'sw-in';
                        inner.style.setProperty('--wi', idx++);
                        inner.textContent = part;
                        outer.appendChild(inner);
                        frag.appendChild(outer);
                    });
                    n.replaceWith(frag);
                } else if (n.nodeType === 1) walk(n);
            });
        };
        walk(el);
    }

    // Envuelve cada palabra en un span (para el texto que se ilumina con el scroll)
    function wrapWords(el) {
        const words = [];
        const walk = node => {
            Array.from(node.childNodes).forEach(n => {
                if (n.nodeType === 3) {
                    const frag = document.createDocumentFragment();
                    n.textContent.split(/(\s+)/).forEach(part => {
                        if (!part) return;
                        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
                        const s = document.createElement('span');
                        s.className = 'w';
                        s.textContent = part;
                        words.push(s);
                        frag.appendChild(s);
                    });
                    n.replaceWith(frag);
                } else if (n.nodeType === 1) walk(n);
            });
        };
        walk(el);
        return words;
    }

    /* ───────── 3. Preloader ───────── */
    function runPreloader(onReady) {
        const pre = $('#preloader');
        const finishUI = () => {
            root.classList.remove('is-loading');
            if (pre) pre.hidden = true;
            onReady();
        };
        if (!pre) { root.classList.add('is-ready'); finishUI(); return; }

        const num = $('#plNum'), hex = $('#plHex'), status = $('#plStatus');
        const phases = [[0, 'Calibrando equipos'], [32, 'Verificando muestras'], [64, 'Sincronizando resultados'], [92, 'Todo listo']];
        const MIN_MS = REDUCE ? 250 : 2400;
        const MAX_MS = 6500;
        const t0 = performance.now();
        let loaded = document.readyState === 'complete';
        let fontsOk = !document.fonts;
        let p = 0, last = t0, done = false, phase = -1;

        if (!loaded) window.addEventListener('load', () => { loaded = true; }, { once: true });
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { fontsOk = true; });

        const complete = () => {
            done = true;
            num.textContent = '100';
            hex.style.strokeDashoffset = 0;
            status.textContent = 'Todo listo';
            setTimeout(() => {
                pre.classList.add('is-done');
                root.classList.add('is-ready');
                setTimeout(finishUI, REDUCE ? 50 : 1150);
            }, REDUCE ? 0 : 450);
        };

        const tick = now => {
            if (done) return;
            const dt = Math.min(.1, (now - last) / 1000);
            last = now;
            const elapsed = now - t0;
            const timeP = clamp(elapsed / MIN_MS, 0, 1);
            let target = easeOutCubic(timeP) * 100;
            const ready = (loaded && fontsOk) || elapsed > MAX_MS;
            if (!ready) target = Math.min(target, 92);
            p += (target - p) * (1 - Math.exp(-dt * 5));
            if (ready && timeP >= 1 && p > 99.2) { complete(); return; }
            const shown = Math.min(99, Math.floor(p));
            num.textContent = shown;
            hex.style.strokeDashoffset = 100 - p;
            let ph = 0;
            phases.forEach((x, i) => { if (p >= x[0]) ph = i; });
            if (ph !== phase) { phase = ph; status.textContent = phases[ph][1]; }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    /* ───────── 4. Header, navegación y menú móvil ───────── */
    function setupHeader() {
        const header = $('#siteHeader');
        const links = $$('.nav-links a');
        const indicator = $('.nav-indicator');
        const nav = $('.nav-links');

        // Estado "scrolled" con un centinela (sin listeners de scroll)
        const sentinel = document.createElement('div');
        sentinel.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:70px;pointer-events:none;visibility:hidden';
        document.body.prepend(sentinel);
        new IntersectionObserver(([e]) => header.classList.toggle('is-scrolled', !e.isIntersecting)).observe(sentinel);

        // Indicador deslizante + enlace activo por sección
        let current = null;
        const moveIndicator = el => {
            if (!indicator || !nav) return;
            if (!el) { indicator.style.opacity = '0'; return; }
            indicator.style.opacity = '1';
            indicator.style.width = el.offsetWidth + 'px';
            indicator.style.transform = `translateX(${el.offsetLeft}px)`;
        };
        links.forEach(a => {
            a.addEventListener('pointerenter', () => moveIndicator(a));
            a.addEventListener('focus', () => moveIndicator(a));
        });
        if (nav) nav.addEventListener('pointerleave', () => moveIndicator(current));

        const map = new Map();
        links.forEach(a => {
            const sec = $(a.getAttribute('href'));
            if (sec) map.set(sec, a);
        });
        const io = new IntersectionObserver(entries => {
            entries.forEach(e => {
                if (!e.isIntersecting) return;
                const a = map.get(e.target);
                links.forEach(l => l.classList.toggle('is-current', l === a));
                current = a;
                moveIndicator(a);
            });
        }, { rootMargin: '-45% 0px -50% 0px' });
        map.forEach((_, sec) => io.observe(sec));
        addEventListener('resize', () => moveIndicator(current));
    }

    function setupMenu() {
        const burger = $('#burger'), menu = $('#mobileMenu');
        if (!burger || !menu) return;
        let open = false;
        const focusables = () => [burger, ...$$('a, button', menu)];

        const setOpen = state => {
            open = state;
            if (state) {
                menu.hidden = false;
                void menu.offsetWidth; // fuerza reflow para animar el clip-path
                menu.classList.add('is-open');
                if (lenis) lenis.stop(); else root.style.overflow = 'hidden';
            } else {
                menu.classList.remove('is-open');
                if (lenis) lenis.start(); else root.style.overflow = '';
                setTimeout(() => { if (!open) menu.hidden = true; }, 850);
            }
            root.classList.toggle('is-menu-open', state);
            burger.setAttribute('aria-expanded', String(state));
            burger.setAttribute('aria-label', state ? 'Cerrar menú' : 'Abrir menú');
            if (state) setTimeout(() => { const first = $('a', menu); if (first) first.focus({ preventScroll: true }); }, 350);
        };

        burger.addEventListener('click', () => setOpen(!open));
        $$('a', menu).forEach(a => a.addEventListener('click', () => setOpen(false)));
        document.addEventListener('keydown', e => {
            if (!open) return;
            if (e.key === 'Escape') { setOpen(false); burger.focus(); return; }
            if (e.key === 'Tab') {
                const f = focusables();
                const first = f[0], lastEl = f[f.length - 1];
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastEl.focus(); }
                else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); }
            }
        });
        matchMedia('(min-width: 1100px)').addEventListener('change', ev => { if (ev.matches && open) setOpen(false); });
    }

    // Anclas con scroll suave (Lenis si existe, nativo si no)
    function setupAnchors() {
        document.addEventListener('click', e => {
            const a = e.target.closest('a[href^="#"]');
            if (!a) return;
            const id = a.getAttribute('href');
            if (id.length < 2) return;
            const target = id === '#top' ? document.body : $(id);
            if (!target) return;
            e.preventDefault();
            if (lenis) lenis.scrollTo(id === '#top' ? 0 : target, { offset: id === '#top' ? 0 : -84, duration: 1.7 });
            else target.scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: 'start' });
            history.replaceState(null, '', id);
        });
    }

    /* ───────── 5. Reveals, títulos y contadores ───────── */
    function setupReveals() {
        $$('[data-split]').forEach(splitMasked);
        const targets = $$('[data-reveal], [data-split]');
        if (REDUCE) { targets.forEach(t => t.classList.add('is-in')); return; }
        const io = new IntersectionObserver(entries => {
            entries.forEach(e => {
                if (!e.isIntersecting) return;
                e.target.classList.add('is-in');
                io.unobserve(e.target);
            });
        }, { threshold: .18, rootMargin: '0px 0px -6% 0px' });
        targets.forEach(t => io.observe(t));
    }

    function setupCounters() {
        const els = $$('[data-count]');
        if (REDUCE || !els.length) return;
        els.forEach(el => { el.textContent = '0'; });
        const io = new IntersectionObserver(entries => {
            entries.forEach(e => {
                if (!e.isIntersecting) return;
                io.unobserve(e.target);
                const el = e.target, end = +el.dataset.count, dur = 1700, t0 = performance.now();
                const step = now => {
                    const k = clamp((now - t0) / dur, 0, 1);
                    el.textContent = Math.round(easeOutExpo(k) * end);
                    if (k < 1) requestAnimationFrame(step);
                };
                requestAnimationFrame(step);
            });
        }, { threshold: .6 });
        els.forEach(el => io.observe(el));
    }

    function setupImageFallbacks() {
        $$('img').forEach(img => {
            const fail = () => { img.style.visibility = 'hidden'; if (img.parentElement) img.parentElement.classList.add('img-fallback'); };
            img.addEventListener('error', fail, { once: true });
            if (img.complete && img.naturalWidth === 0 && img.currentSrc) fail();
        });
    }

    /* ───────── 6. ADN animado (canvas) ───────── */
    const THEMES = {
        light: {
            A: { hi: '#9CC2FB', mid: '#2460D6', lo: '#0A1F5C', rgb: '36,96,214' },
            B: { hi: '#FFA9AB', mid: '#D91F26', lo: '#7F0D13', rgb: '217,31,38' },
            rung: '18,48,127', p1: '62,139,240', p2: '217,31,38', link: '36,96,214'
        },
        dark: {
            A: { hi: '#F2F9FF', mid: '#8AD3F8', lo: '#3E9BE6', rgb: '138,211,248' },
            B: { hi: '#FFFFFF', mid: '#FFB4B6', lo: '#FF6B70', rgb: '255,170,172' },
            rung: '255,255,255', p1: '255,255,255', p2: '255,170,172', link: '255,255,255'
        }
    };

    class Helix {
        constructor(canvas, opts = {}) {
            this.canvas = canvas;
            this.ctx = canvas.getContext('2d');
            this.opt = Object.assign({ theme: 'light', speed: .5, tilt: -.3 }, opts);
            this.theme = THEMES[this.opt.theme];
            const small = innerWidth < 700;
            this.N = small ? 22 : 30;
            this.PN = small ? 24 : 42;
            this.rot = Math.random() * 6;
            this.t = 0; this.boost = 0;
            this.tx = this.ty = this.px = this.py = 0;
            this.intro = REDUCE ? 1 : 0;
            this.introOn = REDUCE;
            this.visible = false; this.raf = 0; this.last = 0;
            this.loop = this.loop.bind(this);
            this.sprites = { A: this.sprite(this.theme.A), B: this.sprite(this.theme.B) };
            this.particles = Array.from({ length: this.PN }, () => ({
                x: Math.random(), y: Math.random(), z: Math.random(),
                r: 1.3 + Math.random() * 3, vy: .012 + Math.random() * .03,
                ph: Math.random() * 6.28, hex: Math.random() < .16, rot: Math.random() * 6,
                warm: Math.random() < .2
            }));
            this.resize();
            new ResizeObserver(() => { this.resize(); if (!this.raf) this.draw(0); }).observe(canvas);
            new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; this.sync(); }).observe(canvas);
            document.addEventListener('visibilitychange', () => this.sync());
            if (REDUCE) this.draw(0);
        }

        sprite(c) {
            const s = 64, cv = document.createElement('canvas');
            cv.width = cv.height = s;
            const g = cv.getContext('2d');
            const gr = g.createRadialGradient(s * .36, s * .32, s * .04, s * .5, s * .5, s * .5);
            gr.addColorStop(0, c.hi); gr.addColorStop(.5, c.mid); gr.addColorStop(1, c.lo);
            g.fillStyle = gr;
            g.beginPath(); g.arc(s / 2, s / 2, s * .48, 0, Math.PI * 2); g.fill();
            g.fillStyle = 'rgba(255,255,255,.55)';
            g.beginPath(); g.arc(s * .36, s * .31, s * .08, 0, Math.PI * 2); g.fill();
            return cv;
        }

        resize() {
            this.dpr = Math.min(devicePixelRatio || 1, 2);
            this.w = Math.max(1, this.canvas.clientWidth);
            this.h = Math.max(1, this.canvas.clientHeight);
            this.canvas.width = Math.round(this.w * this.dpr);
            this.canvas.height = Math.round(this.h * this.dpr);
            this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        }

        sync() {
            const run = this.visible && !document.hidden && !REDUCE;
            if (run && !this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(this.loop); }
            else if (!run && this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
        }

        loop(now) {
            const dt = Math.min(.05, (now - this.last) / 1000);
            this.last = now;
            this.draw(dt);
            this.raf = requestAnimationFrame(this.loop);
        }

        startIntro() { this.introOn = true; }
        kick(v) { this.boost = Math.max(this.boost, Math.min(2.4, v / 1500)); }
        setPointer(nx, ny) { this.tx = nx; this.ty = ny; }

        draw(dt) {
            const { ctx, w, h, theme: T } = this;
            ctx.clearRect(0, 0, w, h);
            this.t += dt;
            if (this.introOn && this.intro < 1) this.intro = Math.min(1, this.intro + dt / 2.4);
            const I = easeOutCubic(this.intro);
            this.rot += dt * (this.opt.speed + this.boost);
            this.boost *= Math.exp(-dt * 2.2);
            const k = Math.min(1, dt * 4);
            this.px += (this.tx - this.px) * k;
            this.py += (this.ty - this.py) * k;

            const U = Math.min(w, h) / 560;
            const cx = w / 2, cy = h / 2;
            const H = h * .84 * I;
            const R0 = 92 * U, persp = 900 * U;
            const tilt = this.opt.tilt + this.px * .14;
            const pitch = this.py * .22 + .08 * Math.sin(this.t * .5);
            const ct = Math.cos(tilt), st = Math.sin(tilt), cp = Math.cos(pitch), sp = Math.sin(pitch);
            const N = this.N, twist = .44;

            const proj = (x, y, z) => {
                const y1 = y * cp - z * sp, z1 = y * sp + z * cp;
                const x2 = x * ct - y1 * st, y2 = x * st + y1 * ct;
                const s = persp / (persp - z1);
                return { x: cx + x2 * s, y: cy + y2 * s, z: z1, s };
            };

            const A = [], B = [];
            for (let i = 0; i < N; i++) {
                const u = i / (N - 1) - .5, y = u * H;
                const barrel = .74 + .26 * Math.cos(u * Math.PI);
                const R = R0 * barrel * (1 + .04 * Math.sin(this.t * 1.4 + i * .6));
                const a = i * twist + this.rot;
                const x = R * Math.cos(a), z = R * Math.sin(a);
                A.push(proj(x, y, z));
                B.push(proj(-x, y, -z));
            }

            this.drawParticles(dt, U, I);

            const items = [];
            for (let i = 0; i < N; i++) {
                items.push({ k: 0, z: (A[i].z + B[i].z) / 2, i });
                items.push({ k: 1, z: A[i].z, i });
                items.push({ k: 2, z: B[i].z, i });
                if (i < N - 1) {
                    items.push({ k: 3, z: (A[i].z + A[i + 1].z) / 2, i });
                    items.push({ k: 4, z: (B[i].z + B[i + 1].z) / 2, i });
                }
            }
            items.sort((p, q) => p.z - q.z);

            const depth = z => clamp((z + R0 * 1.15) / (R0 * 2.3), 0, 1);
            ctx.lineCap = 'round';

            for (const it of items) {
                const i = it.i, dn = depth(it.z);
                if (it.k === 0) { // peldaño (par de bases)
                    const a = A[i], b = B[i];
                    const al = (.16 + .5 * dn) * I;
                    const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
                    g.addColorStop(0, `rgba(${T.A.rgb},${al})`);
                    g.addColorStop(.5, `rgba(${T.rung},${al * .55})`);
                    g.addColorStop(1, `rgba(${T.B.rgb},${al})`);
                    ctx.strokeStyle = g;
                    ctx.lineWidth = 2.6 * U * (a.s + b.s) / 2;
                    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
                    ctx.fillStyle = `rgba(255,255,255,${al * 1.4})`;
                    ctx.beginPath(); ctx.arc((a.x + b.x) / 2, (a.y + b.y) / 2, 2.3 * U * (a.s + b.s) / 2, 0, 6.283); ctx.fill();
                } else if (it.k === 1 || it.k === 2) { // nodos
                    const n = it.k === 1 ? A[i] : B[i];
                    const size = 18 * U * n.s;
                    ctx.globalAlpha = (.45 + .55 * dn) * I;
                    ctx.drawImage(it.k === 1 ? this.sprites.A : this.sprites.B, n.x - size / 2, n.y - size / 2, size, size);
                    ctx.globalAlpha = 1;
                } else { // cadena (esqueleto de la hélice)
                    const S = it.k === 3 ? A : B, c = it.k === 3 ? T.A : T.B;
                    const p = S[i], q = S[i + 1];
                    ctx.strokeStyle = `rgba(${c.rgb},${(.28 + .72 * dn) * I})`;
                    ctx.lineWidth = 6.4 * U * (p.s + q.s) / 2;
                    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
                }
            }
        }

        drawParticles(dt, U, I) {
            const { ctx, w, h, theme: T } = this;
            const pts = this.particles;
            const pos = [];
            for (const p of pts) {
                p.y -= p.vy * dt;
                if (p.y < -.05) { p.y = 1.05; p.x = Math.random(); }
                p.rot += dt * .3;
                pos.push({
                    x: (p.x + Math.sin(this.t * .3 + p.ph) * .02) * w + this.px * p.z * 28,
                    y: p.y * h + this.py * p.z * 20
                });
            }
            const maxD = 125 * U;
            ctx.lineWidth = 1;
            for (let i = 0; i < pts.length; i++) {
                for (let j = i + 1; j < pts.length; j++) {
                    const dx = pos[i].x - pos[j].x, dy = pos[i].y - pos[j].y;
                    const d = Math.hypot(dx, dy);
                    if (d < maxD) {
                        ctx.strokeStyle = `rgba(${T.link},${(1 - d / maxD) * .2 * Math.min(pts[i].z, pts[j].z) * I})`;
                        ctx.beginPath(); ctx.moveTo(pos[i].x, pos[i].y); ctx.lineTo(pos[j].x, pos[j].y); ctx.stroke();
                    }
                }
            }
            for (let i = 0; i < pts.length; i++) {
                const p = pts[i], q = pos[i];
                const r = p.r * U * (.6 + p.z * .9);
                const al = (.2 + .5 * p.z) * I;
                const rgb = p.warm ? T.p2 : T.p1;
                if (p.hex) {
                    ctx.strokeStyle = `rgba(${rgb},${al})`;
                    ctx.lineWidth = 1.2;
                    ctx.beginPath();
                    for (let s = 0; s < 6; s++) {
                        const a = p.rot + s * Math.PI / 3;
                        const hx = q.x + Math.cos(a) * r * 3.2, hy = q.y + Math.sin(a) * r * 3.2;
                        s ? ctx.lineTo(hx, hy) : ctx.moveTo(hx, hy);
                    }
                    ctx.closePath(); ctx.stroke();
                } else {
                    ctx.fillStyle = `rgba(${rgb},${al})`;
                    ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, 6.283); ctx.fill();
                }
            }
        }
    }

    function setupHelix() {
        const c1 = $('#helixCanvas'), c2 = $('#helixCanvas2');
        const hero = c1 ? new Helix(c1, { theme: 'light', speed: .5, tilt: -.3 }) : null;
        const foot = c2 ? new Helix(c2, { theme: 'dark', speed: .38, tilt: .32 }) : null;
        if (foot) foot.startIntro();

        // Parallax del puntero sobre el hero
        const stage = $('.hero-stage'), heroEl = $('.hero');
        if (heroEl && stage && FINE_POINTER && !REDUCE) {
            let raf = 0, nx = 0, ny = 0;
            heroEl.addEventListener('pointermove', e => {
                const r = heroEl.getBoundingClientRect();
                nx = clamp(((e.clientX - r.left) / r.width - .5) * 2, -1, 1);
                ny = clamp(((e.clientY - r.top) / r.height - .5) * 2, -1, 1);
                if (raf) return;
                raf = requestAnimationFrame(() => {
                    raf = 0;
                    stage.style.setProperty('--mx', nx.toFixed(3));
                    stage.style.setProperty('--my', ny.toFixed(3));
                    if (hero) hero.setPointer(nx, ny);
                });
            });
            heroEl.addEventListener('pointerleave', () => {
                stage.style.setProperty('--mx', 0);
                stage.style.setProperty('--my', 0);
                if (hero) hero.setPointer(0, 0);
            });
        }
        return { hero, foot };
    }

    /* ───────── 7. Botones magnéticos ───────── */
    function setupMagnetic() {
        if (!FINE_POINTER || REDUCE) return;
        $$('[data-magnetic]').forEach(el => {
            el.addEventListener('pointermove', e => {
                const r = el.getBoundingClientRect();
                const dx = (e.clientX - (r.left + r.width / 2)) / r.width;
                const dy = (e.clientY - (r.top + r.height / 2)) / r.height;
                el.style.translate = `${(dx * 12).toFixed(1)}px ${(dy * 9).toFixed(1)}px`;
            });
            el.addEventListener('pointerleave', () => { el.style.translate = '0 0'; });
        });
    }

    /* ───────── 8. Estudios especiales (tabs accesibles) ───────── */
    function setupTabs() {
        const tabs = $$('[role="tab"]');
        if (!tabs.length) return;
        const select = (tab, focus) => {
            tabs.forEach(t => {
                const on = t === tab;
                t.classList.toggle('is-active', on);
                t.setAttribute('aria-selected', String(on));
                t.tabIndex = on ? 0 : -1;
                const panel = document.getElementById(t.getAttribute('aria-controls'));
                if (panel) { panel.hidden = !on; panel.classList.toggle('is-active', on); }
            });
            if (focus) tab.focus();
        };
        tabs.forEach((tab, i) => {
            tab.addEventListener('click', () => select(tab));
            tab.addEventListener('keydown', e => {
                let n = null;
                if (e.key === 'ArrowDown' || e.key === 'ArrowRight') n = (i + 1) % tabs.length;
                else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
                else if (e.key === 'Home') n = 0;
                else if (e.key === 'End') n = tabs.length - 1;
                if (n !== null) { e.preventDefault(); select(tabs[n], true); }
            });
        });
    }

    /* ───────── 9. Preguntas frecuentes (acordeón) ───────── */
    function setupAccordion() {
        const items = $$('.acc-item');
        const set = (item, open) => {
            item.classList.toggle('is-open', open);
            $('.acc-btn', item).setAttribute('aria-expanded', String(open));
        };
        items.forEach(item => {
            $('.acc-btn', item).addEventListener('click', () => {
                const willOpen = !item.classList.contains('is-open');
                items.forEach(o => set(o, false));
                set(item, willOpen);
            });
        });
        if (items[0]) set(items[0], true);
    }

    /* ───────── 10. Toma a domicilio: pasos + chat de WhatsApp ───────── */
    function setupHome() {
        const steps = $$('.step'), msgs = $$('.msg'), phone = $('#phone');
        if (!steps.length || !phone) return;
        let current = 0, timers = [];

        const showMsgs = n => {
            timers.forEach(clearTimeout); timers = [];
            let delay = 0;
            msgs.forEach(m => {
                if (+m.dataset.step <= n) {
                    if (!m.classList.contains('is-shown')) {
                        timers.push(setTimeout(() => m.classList.add('is-shown'), REDUCE ? 0 : delay));
                        delay += 650;
                    }
                } else m.classList.remove('is-shown');
            });
        };
        const setStep = n => {
            if (n === current) return;
            current = n;
            steps.forEach((s, i) => {
                s.classList.toggle('is-active', i + 1 === n);
                s.classList.toggle('is-done', i + 1 < n);
            });
            showMsgs(n);
        };

        const stacked = !matchMedia('(min-width: 960px)').matches;
        if (stacked) {
            // En móvil el teléfono va después de los pasos: la conversación se reproduce sola
            const io = new IntersectionObserver(([e]) => {
                if (!e.isIntersecting) return;
                io.disconnect();
                setStep(1);
                if (!REDUCE) { setTimeout(() => setStep(2), 3200); setTimeout(() => setStep(3), 6600); }
                else setStep(3);
            }, { threshold: .45 });
            io.observe(phone);
        } else {
            const io = new IntersectionObserver(entries => {
                entries.forEach(e => { if (e.isIntersecting) setStep(+e.target.dataset.step); });
            }, { rootMargin: '-38% 0px -44% 0px' });
            steps.forEach(s => io.observe(s));
            // Primer mensaje cuando el teléfono aparece
            const pio = new IntersectionObserver(([e]) => {
                if (e.isIntersecting) { pio.disconnect(); setStep(1); }
            }, { threshold: .4 });
            pio.observe(phone);
        }
    }

    /* ───────── 11. Estado "abierto ahora" ───────── */
    function setupOpenStatus() {
        const box = $('#openStatus'), text = $('#openStatusText');
        if (!box || !text) return;
        // Minutos desde 00:00. Lun-Vie 6:30 a 14:00, Sáb 6:30 a 12:30, Dom cerrado
        const SCHEDULE = { Mon: [390, 840], Tue: [390, 840], Wed: [390, 840], Thu: [390, 840], Fri: [390, 840], Sat: [390, 750], Sun: null };
        const ORDER = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const DAYS_ES = { Sun: 'el domingo', Mon: 'el lunes', Tue: 'el martes', Wed: 'el miércoles', Thu: 'el jueves', Fri: 'el viernes', Sat: 'el sábado' };
        const fmt = m => { const h = Math.floor(m / 60), mi = m % 60; const h12 = ((h + 11) % 12) + 1; return `${h12}:${String(mi).padStart(2, '0')} ${h < 12 ? 'a.m.' : 'p.m.'}`; };

        const now = () => {
            const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Mexico_City', weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date());
            const get = t => parts.find(p => p.type === t).value;
            return { day: get('weekday'), mins: (parseInt(get('hour'), 10) % 24) * 60 + parseInt(get('minute'), 10) };
        };
        const update = () => {
            let d;
            try { d = now(); } catch (_) { box.hidden = true; return; }
            const today = SCHEDULE[d.day];
            if (today && d.mins >= today[0] && d.mins < today[1]) {
                box.dataset.state = 'open';
                text.textContent = `Abierto ahora, cerramos a las ${fmt(today[1])}`;
                return;
            }
            box.dataset.state = 'closed';
            const idx = ORDER.indexOf(d.day);
            for (let off = 0; off < 8; off++) {
                const key = ORDER[(idx + off) % 7], s = SCHEDULE[key];
                if (!s || (off === 0 && d.mins >= s[0])) continue;
                const when = off === 0 ? 'hoy' : off === 1 ? 'mañana' : DAYS_ES[key];
                text.textContent = `Cerrado ahora, abrimos ${when} a las ${fmt(s[0])}`;
                return;
            }
        };
        update();
        setInterval(update, 60000);
    }

    /* ───────── 12. Formulario → WhatsApp ───────── */
    function setupForm() {
        const form = $('#contactForm');
        if (!form) return;
        const status = $('#formStatus');
        const fields = {
            nombre: { el: $('#f-name'), err: $('#f-name-err') },
            telefono: { el: $('#f-phone'), err: $('#f-phone-err') },
            servicio: { el: $('#f-service'), err: $('#f-service-err') }
        };
        const setError = (key, msg) => {
            const { el, err } = fields[key];
            const wrap = el.closest('.field');
            wrap.classList.toggle('has-error', !!msg);
            err.textContent = msg || '';
            el.setAttribute('aria-invalid', msg ? 'true' : 'false');
        };
        const validate = () => {
            let ok = true, firstBad = null;
            const name = fields.nombre.el.value.trim();
            const phone = fields.telefono.el.value.replace(/\D/g, '');
            if (name.length < 2) { setError('nombre', 'Escribe tu nombre para poder atenderte.'); ok = false; firstBad = firstBad || fields.nombre.el; } else setError('nombre', '');
            if (fields.telefono.el.value.trim() && phone.length < 10) { setError('telefono', 'Escribe los 10 dígitos de tu teléfono.'); ok = false; firstBad = firstBad || fields.telefono.el; } else setError('telefono', '');
            if (!fields.servicio.el.value) { setError('servicio', 'Elige qué necesitas.'); ok = false; firstBad = firstBad || fields.servicio.el; } else setError('servicio', '');
            if (firstBad) firstBad.focus();
            return ok;
        };
        Object.keys(fields).forEach(k => {
            fields[k].el.addEventListener('input', () => { if (fields[k].el.closest('.field').classList.contains('has-error')) validate(); });
            fields[k].el.addEventListener('change', () => { if (fields[k].el.closest('.field').classList.contains('has-error')) validate(); });
        });

        form.addEventListener('submit', e => {
            e.preventDefault();
            status.textContent = '';
            if (!validate()) return;
            const d = new FormData(form);
            const lines = [
                `Hola BioGeneX Labs, soy ${d.get('nombre').trim()}.`,
                `Me interesa: ${d.get('servicio')}.`,
                `Me viene bien: ${d.get('cuando')}.`
            ];
            if ((d.get('mensaje') || '').trim()) lines.push(`Mensaje: ${d.get('mensaje').trim()}`);
            if ((d.get('telefono') || '').trim()) lines.push(`Mi teléfono: ${d.get('telefono').trim()}`);
            const url = waLink(lines.join('\n'));
            window.open(url, '_blank', 'noopener');
            status.innerHTML = `<strong>¡Listo!</strong> Abrimos WhatsApp con tu mensaje. Si no se abrió, <a href="${url}" target="_blank" rel="noopener">toca aquí</a>.`;
        });
    }

    /* ───────── 13. Botón flotante de WhatsApp ───────── */
    function setupFloatingWhatsApp() {
        const wrap = $('#waFloat');
        if (!wrap) return;
        setTimeout(() => {
            wrap.classList.add('show-bubble');
            setTimeout(() => wrap.classList.remove('show-bubble'), 6500);
        }, 7000);
    }

    /* ───────── 14. Scroll suave (Lenis) ───────── */
    function setupSmoothScroll() {
        if (REDUCE || !window.Lenis) return;
        lenis = new window.Lenis({
            duration: 1.25,
            easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
            smoothWheel: true
        });
        if (HAS_GSAP) {
            lenis.on('scroll', ScrollTrigger.update);
            gsap.ticker.add(time => lenis.raf(time * 1000));
            gsap.ticker.lagSmoothing(0);
        } else {
            const raf = t => { lenis.raf(t); requestAnimationFrame(raf); };
            requestAnimationFrame(raf);
        }
    }

    /* ───────── 15. Capa de scroll (GSAP + ScrollTrigger) ───────── */
    function setupScrollScenes(helixes) {
        if (!HAS_GSAP) return;
        const mm = gsap.matchMedia();

        // Barra de progreso global
        gsap.to('.scroll-progress span', { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: .3 } });

        // El ADN gira más rápido mientras haces scroll (continuidad entre scroll y marca)
        ScrollTrigger.create({
            start: 0, end: 'max',
            onUpdate: self => { const v = Math.abs(self.getVelocity()); if (helixes.hero) helixes.hero.kick(v); if (helixes.foot) helixes.foot.kick(v * .6); }
        });

        // Hero: el escenario del ADN se mueve más lento que el contenido
        gsap.to('.helix-canvas', { yPercent: 8, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
        gsap.to('.stage-rings', { yPercent: 14, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
        gsap.to('.hero-copy', { yPercent: -8, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });

        // Manifiesto: las palabras se iluminan una a una
        const manifesto = $('[data-scrub-words]');
        if (manifesto) {
            const words = wrapWords(manifesto);
            gsap.fromTo(words, { opacity: .18 }, {
                opacity: 1, ease: 'none', stagger: .08,
                scrollTrigger: { trigger: manifesto, start: 'top 82%', end: 'bottom 52%', scrub: .6 }
            });
        }

        // Imagen que se abre a pantalla completa
        const stage = $('.expand-stage');
        if (stage) {
            const media = $('.expand-media', stage), img = $('img', media);
            const tA = $('.et--a', stage), tB = $('.et--b', stage);
            const pillars = $$('.pillar', stage), scrim = $('.expand-scrim', stage);
            mm.add({ wide: '(min-width: 640px)', narrow: '(max-width: 639px)' }, ctx => {
                const { wide } = ctx.conditions;
                const ix = wide ? 31 : 13, iy = wide ? 28 : 31;
                const startClip = `inset(${iy}% ${ix}% ${iy}% ${ix}% round 32px)`;
                gsap.set(media, { clipPath: startClip });
                gsap.set(img, { scale: 1.4 });
                gsap.set(scrim, { opacity: 0 });
                gsap.set(pillars, { opacity: 0, y: 44 });
                const tl = gsap.timeline({
                    defaults: { ease: 'none' },
                    scrollTrigger: { trigger: stage, start: 'top top', end: '+=170%', pin: true, scrub: .8, anticipatePin: 1 }
                });
                // fromTo explícito: el navegador abrevia el inset calculado y GSAP lo interpolaría mal
                tl.fromTo(media, { clipPath: startClip }, { clipPath: 'inset(0% 0% 0% 0% round 0px)', ease: 'power2.inOut', duration: 1 }, 0)
                  .to(img, { scale: 1, duration: 1.3 }, 0)
                  .to(tA, { yPercent: -220, opacity: 0, ease: 'power2.in', duration: .38 }, 0)
                  .to(tB, { yPercent: 220, opacity: 0, ease: 'power2.in', duration: .38 }, 0)
                  .to(scrim, { opacity: 1, duration: .55 }, .5)
                  .to(pillars, { opacity: 1, y: 0, stagger: .14, duration: .45, ease: 'power3.out' }, .88)
                  .to({}, { duration: .45 });
            });
        }

        // Servicios: scroll horizontal fijado (solo escritorio; en móvil es un carrusel táctil)
        mm.add('(min-width: 960px)', () => {
            const sec = $('.services'), pin = $('.services-pin'), track = $('.services-track'), bar = $('.services-progress span');
            if (!sec || !pin || !track) return;
            sec.classList.add('is-pinned');
            const dist = () => Math.max(0, track.scrollWidth - document.documentElement.clientWidth);
            const pan = gsap.to(track, {
                x: () => -dist(), ease: 'none',
                scrollTrigger: {
                    trigger: pin, start: 'top top', end: () => '+=' + dist(),
                    pin: true, scrub: 1, invalidateOnRefresh: true,
                    onUpdate: self => { if (bar) bar.style.transform = `scaleX(${self.progress})`; }
                }
            });
            $$('.svc-photo img', track).forEach(im => {
                gsap.fromTo(im, { xPercent: -6, scale: 1.18 }, {
                    xPercent: 6, scale: 1.18, ease: 'none',
                    scrollTrigger: { trigger: im.closest('.svc-card'), containerAnimation: pan, start: 'left right', end: 'right left', scrub: true }
                });
            });
            return () => sec.classList.remove('is-pinned');
        });

        // Parallax suave dentro de las fotos del bento
        $$('[data-parallax]').forEach(im => {
            gsap.fromTo(im, { yPercent: -5 }, { yPercent: 5, ease: 'none', scrollTrigger: { trigger: im.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } });
        });

        // Footer: la palabra gigante emerge al llegar al final
        const giant = $('.footer-giant');
        if (giant) gsap.fromTo(giant, { yPercent: 38 }, { yPercent: 0, ease: 'none', scrollTrigger: { trigger: '.footer-bottom', start: 'top bottom', end: 'bottom bottom', scrub: true } });
    }

    /* ───────── Arranque ───────── */
    function init() {
        const yr = $('#year');
        if (yr) yr.textContent = new Date().getFullYear();

        setupWhatsApp();
        setupImageFallbacks();

        if (HAS_GSAP) {
            gsap.registerPlugin(ScrollTrigger);
            ScrollTrigger.config({ ignoreMobileResize: true });
            root.classList.add('gsap-ok');
        }

        setupReveals();
        setupCounters();
        setupHeader();
        setupMenu();
        setupTabs();
        setupAccordion();
        setupHome();
        setupOpenStatus();
        setupForm();
        setupMagnetic();
        setupAnchors();

        const helixes = setupHelix();
        setupScrollScenes(helixes);

        runPreloader(() => {
            setupSmoothScroll();
            setupFloatingWhatsApp();
            if (HAS_GSAP) ScrollTrigger.refresh();
        });

        // El ADN "se construye" justo cuando se abre el telón del preloader
        const startIntro = () => { if (helixes.hero) helixes.hero.startIntro(); };
        if (root.classList.contains('is-ready')) startIntro();
        else new MutationObserver((_, obs) => { if (root.classList.contains('is-ready')) { startIntro(); obs.disconnect(); } }).observe(root, { attributes: true, attributeFilter: ['class'] });

        // Recalcula las posiciones del scroll cuando todo (fuentes e imágenes) terminó de cargar
        addEventListener('load', () => { if (HAS_GSAP) ScrollTrigger.refresh(); });
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (HAS_GSAP) ScrollTrigger.refresh(); });
    }

    init();
})();
