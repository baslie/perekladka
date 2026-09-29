// «Рассвет»: восемь сцен, прокрутка управляет таймлайнами. Раскадровка — docs/storyboard.md.
//
// Каждая сцена закрепляется (pin) на длину из data-length (в процентах высоты экрана)
// плюс «хвост» 100%, пока на неё наезжает лист следующей сцены. Таймлайн сцены нормирован:
// её собственное действие занимает отрезок 0–1 — позиции в коде совпадают с долями
// прокрутки в таблице раскадровки, — а хвост идёт после 1.
//
// Плавная прокрутка — Lenis, по официальной связке с GSAP (README lenis, «GSAP ScrollTrigger»):
// Lenis крутится от тикера GSAP, каждое его событие прокрутки обновляет ScrollTrigger.
// Инерцию даёт Lenis, поэтому у сцен scrub: true — второе сглаживание сверху дало бы
// ощущение «ватной» прокрутки.
//
// ?debug в адресе — маркеры ScrollTrigger и счётчик «сцена / прогресс».

(() => {
  if (!window.gsap || !window.ScrollTrigger) return; // CDN не загрузился — страница остаётся статичной

  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });

  // Без Lenis (CDN недоступен) всё работает на обычной прокрутке.
  // При «уменьшить движение» Lenis сам отключает сглаживание (respectReducedMotion).
  // На тач-экранах прокрутка остаётся нативной (syncTouch: false по умолчанию).
  // Ссылки-якоря навигации обрабатываем сами: цель — начало закрепления сцены.
  let lenis = null;
  if (window.Lenis) {
    lenis = new Lenis({ lerp: 0.1 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000)); // тикер GSAP — в секундах, Lenis ждёт мс
    gsap.ticker.lagSmoothing(0);
    window.lenis = lenis; // для отладки из консоли
  }

  const DEBUG = new URLSearchParams(location.search).has('debug');
  const STEP = 0.002; // смена позы в шаге — практически мгновенная
  const TAIL = 100; // хвост сцены, % высоты экрана: столько длится наезд следующего листа
  const hud = document.querySelector('.hud');
  if (DEBUG) hud.hidden = false;

  const pins = new Map(); // id сцены → её ScrollTrigger (для навигации)
  const idle = []; // обновлялки «сцена на экране или нет»; до первого refresh isActive врёт
  ScrollTrigger.addEventListener('refresh', () => idle.forEach((update) => update()));

  // ─── живое вне прокрутки ────────────────────────────────────────

  /** Звёзды: два слоя точек через box-shadow, мерцают CSS-анимацией в разном ритме. */
  function makeStars(el, count) {
    for (let layer = 0; layer < 2; layer++) {
      const dots = [];
      for (let i = 0; i < count / 2; i++) {
        const size = Math.random() < 0.15 ? 1 : 0;
        const alpha = (0.35 + Math.random() * 0.6).toFixed(2);
        dots.push(`${(Math.random() * 100).toFixed(1)}vw ${(Math.random() * 60).toFixed(1)}vh 0 ${size}px rgba(255,250,235,${alpha})`);
      }
      const star = document.createElement('i');
      star.style.boxShadow = dots.join(',');
      el.append(star);
    }
  }
  document.querySelectorAll('.stars').forEach((el) => makeStars(el, 90));

  /** Подпись разбивается на слова, чтобы выкладывать их по одному. */
  document.querySelectorAll('.caption > span').forEach((span) => {
    span.innerHTML = span.textContent
      .split(' ')
      .map((word) => `<span class="w">${word}</span>`)
      .join(' ');
  });

  // ─── сборка сцен ────────────────────────────────────────────────

  /**
   * Лист сцены наезжает на предыдущую: пока секция поднимается снизу до верха экрана,
   * .sheet выпрямляется из лёгкого наклона. Вызывать до scene() этой же секции —
   * ScrollTrigger считает позиции в порядке создания.
   */
  function sheetIn(section, onToggle) {
    return gsap.fromTo(
      section.querySelector('.sheet'),
      { rotation: 3.5, y: '6vh' },
      {
        rotation: 0,
        y: 0,
        ease: 'none',
        scrollTrigger: { trigger: section, start: 'top bottom', end: 'top top', scrub: true, onToggle },
      },
    ).scrollTrigger;
  }

  /** Закрепить сцену и собрать её таймлайн. build(tl, q) получает q — querySelector внутри сцены. */
  function scene(id, build) {
    const section = document.getElementById(id);
    let update = () => {};
    const entry = section.previousElementSibling ? sheetIn(section, () => update()) : null;
    const length = Number(section.dataset.length);
    const end = (length + TAIL) / length; // конец хвоста в единицах таймлайна

    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        end: `+=${length + TAIL}%`,
        pin: true,
        scrub: true,
        invalidateOnRefresh: true,
        markers: DEBUG,
        onToggle: () => update(),
        onUpdate: (st) => {
          nav.progress(id, Math.min(st.progress * end, 1));
          if (DEBUG) hud.textContent = `${id} ${(st.progress * end * 100).toFixed(0)}%`;
        },
      },
    });
    build(tl, (sel) => section.querySelector(sel), section);

    // Хвост: сцена отступает и темнеет под наезжающим листом.
    tl.to(section.querySelector('.paper'), { scale: 0.94, duration: end - 1, ease: 'power1.in' }, 1);
    tl.to(section.querySelector('.dim'), { opacity: 0.7, duration: end - 1, ease: 'power1.in' }, 1);
    tl.set({}, {}, end);

    pins.set(id, tl.scrollTrigger);

    // Дыхание героя: поза чуть вытягивается и опадает, пока никто не листает.
    const breath = [...section.querySelectorAll('.pose')].map((pose, i) =>
      gsap.to(pose, { scaleY: 1.012, scaleX: 0.996, duration: 1.7, delay: i * 0.13, ease: 'sine.inOut', repeat: -1, yoyo: true, paused: true }),
    );
    const triggers = [entry, tl.scrollTrigger];
    update = () => {
      const active = triggers.some((st) => st && st.isActive);
      section.classList.toggle('is-idle', !active);
      breath.forEach((tw) => tw.paused(!active));
      nav.active(id, tl.scrollTrigger.isActive);
    };
    idle.push(update);
  }

  /**
   * Показать позу героя с номером index в момент at. fade — длина перекрёстного затухания:
   * для шагов почти ноль (стоп-моушен, иначе на смене видны две полупрозрачные позы),
   * для поворотов — заметное.
   */
  function showPose(tl, hero, index, at, fade = 0.02) {
    hero.querySelectorAll('.pose').forEach((pose, i) => {
      tl.to(pose, { autoAlpha: i === index ? 1 : 0, duration: fade }, at);
    });
  }

  /** Подпись-табличка: подлетает с поворотом, слова выкладываются по одному, уходит вверх. */
  function caption(tl, el, inAt, outAt) {
    const paper = el.firstElementChild;
    const words = el.querySelectorAll('.w');
    tl.set(el, { autoAlpha: 1 }, inAt);
    tl.fromTo(paper, { y: 40, rotation: -5, autoAlpha: 0 }, { y: 0, rotation: 0, autoAlpha: 1, duration: 0.06, ease: 'power2.out' }, inAt);
    tl.fromTo(words, { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.03, stagger: 0.012 }, inAt + 0.03);
    tl.to(el, { autoAlpha: 0, y: -24, duration: 0.07 }, outAt);
  }

  // ─── навигация по сценам ────────────────────────────────────────

  const nav = (() => {
    const root = document.querySelector('.scenes');
    const links = new Map([...root.querySelectorAll('a')].map((a) => [a.hash.slice(1), a]));
    const narrow = window.matchMedia('(max-width: 700px)');

    root.addEventListener('click', (event) => {
      const link = event.target.closest('a');
      const st = link && pins.get(link.hash.slice(1));
      if (!st) return; // без анимации — обычный якорь
      event.preventDefault();
      const y = st.start + 1;
      if (lenis) lenis.scrollTo(y, { duration: 1.6 });
      else window.scrollTo({ top: y, behavior: 'smooth' });
    });

    // Название активной сцены показываем, пока идёт прокрутка, и ещё секунду после.
    let timer = 0;
    const scrolling = () => {
      root.classList.add('is-scrolling');
      clearTimeout(timer);
      timer = setTimeout(() => root.classList.remove('is-scrolling'), 1200);
    };
    if (lenis) lenis.on('scroll', scrolling);
    else window.addEventListener('scroll', scrolling, { passive: true });

    return {
      progress(id, p) {
        const fill = links.get(id)?.firstElementChild;
        if (fill) fill.style.transform = narrow.matches ? `scaleX(${p})` : `scaleY(${p})`;
      },
      active(id, on) {
        links.get(id)?.classList.toggle('is-active', on);
      },
    };
  })();

  // ─── сцены ──────────────────────────────────────────────────────

  const mm = gsap.matchMedia();

  // При «уменьшить движение» ничего не собираем: сцены стоят статичными кадрами.
  mm.add('(prefers-reduced-motion: no-preference)', () => {
    document.documentElement.classList.add('motion');

    // 1. Окно — наезд камеры сквозь стекло
    scene('window', (tl, q) => {
      tl.to(q('.title'), { y: -80, autoAlpha: 0, duration: 0.25 }, 0);
      tl.to(q('.camera'), { scale: 8, duration: 0.8, ease: 'power2.in' }, 0.2);
    });

    // 2. Улица — горизонтальный параллакс, шаги
    scene('street', (tl, q) => {
      const shift = (el) => () => -(el.offsetWidth - window.innerWidth);
      for (const sel of ['.strip--far', '.strip--near', '.strip--lamps']) {
        tl.to(q(sel), { x: shift(q(sel)), duration: 1 }, 0);
      }
      tl.to(q('.stars'), { x: '-4vw', duration: 1 }, 0);
      const hero = q('.hero');
      const steps = 12;
      for (let i = 0; i < steps; i++) showPose(tl, hero, i % 3, i / steps, STEP);
      tl.to(hero, { y: -8, duration: 1 / (steps * 2), repeat: steps * 2 - 1, yoyo: true, ease: 'sine.inOut' }, 0);
      caption(tl, q('.caption'), 0.05, 0.8);
    });

    // 3. Опушка — лес открывается кругом, герой оборачивается и машет
    scene('edge', (tl, q) => {
      tl.to(q('.reveal'), { clipPath: 'circle(150% at 50% 60%)', duration: 0.35, ease: 'power2.in' }, 0);
      const hero = q('.hero');
      showPose(tl, hero, 1, 0.5);
      showPose(tl, hero, 2, 0.65);
      showPose(tl, hero, 3, 0.8);
      tl.to(hero, { rotation: 2.5, duration: 0.03, repeat: 5, yoyo: true, ease: 'sine.inOut' }, 0.82);
      caption(tl, q('.caption'), 0.35, 0.9);
    });

    // 4. Лес — камера вглубь: чем ближе слой, тем сильнее растёт и быстрее уходит к краю
    scene('forest', (tl, q) => {
      tl.to(q('.l-forest-front-left'), { xPercent: -45, scale: 1.8, transformOrigin: '0% 50%', duration: 1 }, 0);
      tl.to(q('.l-forest-front-right'), { xPercent: 45, scale: 1.8, transformOrigin: '100% 50%', duration: 1 }, 0);
      tl.to(q('.l-forest-mid'), { scale: 1.5, duration: 1 }, 0);
      tl.to(q('.fog'), { scale: 1.25, duration: 1 }, 0);
      tl.to(q('.l-forest-far'), { scale: 1.12, transformOrigin: '50% 55%', duration: 1 }, 0);
      const hero = q('.hero');
      tl.to(hero, { scale: 0.45, y: '-30vh', duration: 1 }, 0);
      for (let i = 0; i < 10; i++) showPose(tl, hero, i % 2, i / 10, STEP);
      caption(tl, q('.caption'), 0.05, 0.75);
    });

    // 5. Склон — ночь сменяется предрассветьем, звёзды гаснут, герой идёт по диагонали вверх
    scene('slope', (tl, q) => {
      tl.to(q('.sky--predawn'), { opacity: 1, duration: 1, ease: 'power1.in' }, 0);
      tl.to(q('.stars'), { opacity: 0, duration: 0.7 }, 0);
      tl.to(q('.l-slope-hill'), { x: '-4vw', y: '4vh', duration: 1 }, 0);
      const hero = q('.hero');
      tl.to(hero, { x: '55vw', y: '-38vh', scale: 0.8, duration: 1 }, 0);
      for (let i = 0; i < 8; i++) showPose(tl, hero, i % 2, i / 8, STEP);
      caption(tl, q('.caption'), 0.1, 0.85);
    });

    // 6. Рассвет — солнце, свет, отъезд, крупный план
    scene('dawn', (tl, q) => {
      tl.fromTo(q('.sun'), { y: '33vh' }, { y: '-3vh', duration: 0.55, ease: 'power1.out' }, 0);
      tl.to(q('.light'), { opacity: 0.6, duration: 0.4 }, 0);
      tl.fromTo(q('.camera'), { scale: 1.4 }, { scale: 1, duration: 0.4, ease: 'power1.inOut' }, 0.2);
      caption(tl, q('.caption'), 0.1, 0.6);
      tl.fromTo(q('.closeup'), { autoAlpha: 0, scale: 1.08 }, { autoAlpha: 1, scale: 1, duration: 0.12 }, 0.75);
    });

    // 7. Закулисье — кадр рассвета поворачивается и разъезжается на стопку вырезок,
    //    у каждой всплывает табличка, потом всё складывается обратно
    scene('backstage', (tl, q) => {
      const depth = { '.plate--sky': -600, '.plate--sun': -420, '.plate--hills': -220, '.plate--summit': 0, '.plate--hero': 160 };
      // В портрете кадр вписан в ширину экрана (style.css) — поворачиваем мягче и почти не уменьшаем.
      const portrait = () => window.matchMedia('(orientation: portrait)').matches;
      tl.to(q('.stage'), {
        rotationY: () => (portrait() ? -26 : -30),
        rotationX: 6,
        scale: () => (portrait() ? 0.8 : 0.7),
        xPercent: -9,
        yPercent: -5,
        duration: 0.3,
        ease: 'power2.inOut',
      }, 0.08);
      // Глубина — в пикселях при ширине кадра 1440; для других кадров пропорционально.
      const frame = q('.frame');
      for (const [sel, z] of Object.entries(depth)) {
        tl.to(q(sel), { z: () => (z * frame.offsetWidth) / 1440, duration: 0.3, ease: 'power2.inOut' }, 0.1);
      }
      q('.stage').querySelectorAll('.tag').forEach((tag, i) => {
        tl.fromTo(tag, { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.05 }, 0.38 + i * 0.05);
        tl.to(tag, { autoAlpha: 0, duration: 0.04 }, 0.72);
      });
      tl.to(q('.stage'), { rotationY: 0, rotationX: 0, scale: 1, xPercent: 0, yPercent: 0, duration: 0.2, ease: 'power2.inOut' }, 0.78);
      for (const sel of Object.keys(depth)) {
        tl.to(q(sel), { z: 0, duration: 0.2, ease: 'power2.inOut' }, 0.78);
      }
      caption(tl, q('.caption'), 0.02, 0.3);
    });

    // 8. Финал — последний лист ложится поверх собранной сцены; на светлой бумаге виньетка не нужна
    const final = document.getElementById('final');
    sheetIn(final);
    ScrollTrigger.create({
      trigger: final,
      start: 'top 40%',
      onToggle: (st) => document.querySelector('.grain').classList.toggle('is-light', st.isActive),
    });

    return () => document.documentElement.classList.remove('motion');
  });
})();
