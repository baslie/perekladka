// «Рассвет»: семь сцен, прокрутка управляет таймлайнами. Раскадровка — docs/storyboard.md.
//
// Каждая сцена закрепляется (pin) на длину из data-length (в процентах высоты экрана),
// а её таймлайн нормирован на длительность 1: позиции в коде — доли прокрутки сцены,
// ровно как в таблице раскадровки.
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
  if (window.Lenis) {
    const lenis = new Lenis({ lerp: 0.1, anchors: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000)); // тикер GSAP — в секундах, Lenis ждёт мс
    gsap.ticker.lagSmoothing(0);
    window.lenis = lenis; // для отладки из консоли
  }

  const DEBUG = new URLSearchParams(location.search).has('debug');
  const STEP = 0.002; // смена позы в шаге — практически мгновенная
  const hud = document.querySelector('.hud');
  if (DEBUG) hud.hidden = false;

  /** Закрепить сцену и собрать её таймлайн. build(tl, q) получает q — querySelector внутри сцены. */
  function scene(id, build) {
    const section = document.getElementById(id);
    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        end: `+=${section.dataset.length}%`,
        pin: true,
        scrub: true,
        invalidateOnRefresh: true,
        markers: DEBUG,
        onUpdate: DEBUG ? (st) => (hud.textContent = `${id} ${(st.progress * 100).toFixed(0)}%`) : undefined,
      },
    });
    build(tl, (sel) => section.querySelector(sel));
    tl.set({}, {}, 1); // длительность ровно 1, даже если последний твин кончается раньше
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

  /** Подпись: появляется в inAt, уходит в outAt. */
  function caption(tl, el, inAt, outAt) {
    tl.fromTo(el, { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.08 }, inAt);
    tl.to(el, { autoAlpha: 0, y: -20, duration: 0.08 }, outAt);
  }

  const mm = gsap.matchMedia();

  // При «уменьшить движение» ничего не собираем: сцены стоят статичными кадрами.
  mm.add('(prefers-reduced-motion: no-preference)', () => {
    // 1. Окно — наезд камеры сквозь стекло
    scene('window', (tl, q) => {
      tl.to(q('.title'), { y: -80, autoAlpha: 0, duration: 0.25 }, 0);
      tl.to(q('.camera'), { scale: 5, duration: 0.6, ease: 'power1.in' }, 0.2);
      tl.to(q('.fade'), { opacity: 1, duration: 0.25 }, 0.75);
    });

    // 2. Улица — горизонтальный параллакс, шаги
    scene('street', (tl, q) => {
      const shift = (el) => () => -(el.offsetWidth - window.innerWidth);
      for (const sel of ['.strip--far', '.strip--near', '.strip--lamps']) {
        tl.to(q(sel), { x: shift(q(sel)), duration: 1 }, 0);
      }
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
      tl.to(q('.l-forest-far'), { scale: 1.12, transformOrigin: '50% 55%', duration: 1 }, 0);
      const hero = q('.hero');
      tl.to(hero, { scale: 0.45, y: '-30vh', duration: 1 }, 0);
      for (let i = 0; i < 10; i++) showPose(tl, hero, i % 2, i / 10, STEP);
      caption(tl, q('.caption'), 0.05, 0.75);
    });

    // 5. Склон — небо светлеет, герой идёт по диагонали вверх
    scene('slope', (tl, q) => {
      const sky = q('.sky--slope');
      tl.to(sky, { backgroundColor: '#3b2f5c', duration: 0.5 }, 0);
      tl.to(sky, { backgroundColor: '#e89a8a', duration: 0.5 }, 0.5);
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

    // Индикатор прогресса всей истории
    gsap.to('.progress__bar', {
      scaleX: 1,
      ease: 'none',
      scrollTrigger: { start: 0, end: 'max', scrub: true },
    });
  });
})();
