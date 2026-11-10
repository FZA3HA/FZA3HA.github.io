const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/* ---------- nav ---------- */
const nav = document.getElementById('siteNav');
const burger = nav?.querySelector<HTMLButtonElement>('.burger');
const panel = document.getElementById('navPanel');

const onScroll = () => nav?.toggleAttribute('data-scrolled', window.scrollY > 8);
onScroll();
window.addEventListener('scroll', onScroll, { passive: true });

const closeMenu = () => {
  nav?.removeAttribute('data-open');
  burger?.setAttribute('aria-expanded', 'false');
  document.body.style.removeProperty('overflow');
};

burger?.addEventListener('click', () => {
  if (!nav) return;
  const open = !nav.hasAttribute('data-open');
  nav.toggleAttribute('data-open', open);
  burger.setAttribute('aria-expanded', String(open));
  if (open) document.body.style.setProperty('overflow', 'hidden');
  else document.body.style.removeProperty('overflow');
});

panel?.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeMenu();
});
window.addEventListener('resize', () => {
  if (window.innerWidth > 1024) closeMenu();
});

/* ---------- language preference ---------- */
document.querySelectorAll<HTMLElement>('[data-lang-switch]').forEach((el) => {
  el.addEventListener('click', () => {
    try {
      localStorage.setItem('fz:lang', el.dataset.langSwitch || 'ar');
    } catch {
      /* ignore */
    }
  });
});

/* ---------- pointer spotlight ---------- */
if (finePointer && !reduceMotion) {
  const root = document.documentElement;
  root.classList.add('has-pointer');
  let raf = 0;
  let mx = 0;
  let my = 0;
  window.addEventListener(
    'pointermove',
    (event) => {
      mx = event.clientX;
      my = event.clientY;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        root.style.setProperty('--mx', `${mx}px`);
        root.style.setProperty('--my', `${my}px`);
      });
    },
    { passive: true },
  );
}

/* ---------- scroll reveal ----------
   Simple rect check on scroll instead of IntersectionObserver:
   deterministic, works in every renderer, and cheap for ~20 nodes. */
const revealEls = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));

if (reduceMotion) {
  revealEls.forEach((el) => el.classList.add('is-in'));
} else {
  let queued = false;

  const reveal = () => {
    queued = false;
    const limit = window.innerHeight * 0.94;
    for (const el of revealEls) {
      if (el.classList.contains('is-in')) continue;
      const rect = el.getBoundingClientRect();
      if (rect.top < limit && rect.bottom > 0) el.classList.add('is-in');
    }
  };

  const requestReveal = () => {
    if (queued) return;
    queued = true;
    window.setTimeout(reveal, 50);
  };

  requestReveal();
  window.addEventListener('scroll', requestReveal, { passive: true });
  window.addEventListener('resize', requestReveal);
  window.addEventListener('load', requestReveal);

  /* Safety net: some embedded/webview browsers never fire `scroll` for
     programmatic jumps. A few timed passes keep content from staying hidden. */
  window.setTimeout(requestReveal, 260);
  window.setTimeout(requestReveal, 1100);
  window.setTimeout(requestReveal, 2400);
}

/* ---------- 3d tilt (desktop only) ---------- */
if (finePointer && !reduceMotion) {
  document.querySelectorAll<HTMLElement>('[data-tilt]').forEach((el) => {
    let rect: DOMRect | null = null;
    const strength = 6;
    el.addEventListener('pointerenter', () => {
      rect = el.getBoundingClientRect();
    });
    el.addEventListener('pointermove', (event) => {
      if (!rect) rect = el.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width - 0.5;
      const py = (event.clientY - rect.top) / rect.height - 0.5;
      el.style.transform = `perspective(900px) rotateY(${(px * strength).toFixed(2)}deg) rotateX(${(-py * strength).toFixed(2)}deg) translateY(-4px)`;
    });
    el.addEventListener('pointerleave', () => {
      el.style.transform = '';
      rect = null;
    });
  });
}

/* ---------- copy to clipboard ---------- */
document.querySelectorAll<HTMLElement>('[data-copy]').forEach((button) => {
  button.addEventListener('click', async () => {
    const text = button.dataset.copy || '';
    const copied = button.dataset.copied || 'Copied';
    const original = button.getAttribute('aria-label') || '';
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    button.setAttribute('aria-label', copied);
    button.classList.add('is-copied');
    window.setTimeout(() => {
      button.setAttribute('aria-label', original);
      button.classList.remove('is-copied');
    }, 1600);
  });
});

/* ---------- contact form ---------- */
const form = document.querySelector<HTMLFormElement>('[data-contact-form]');
if (form) {
  const status = form.querySelector<HTMLElement>('[data-status]');
  const endpoint = form.dataset.endpoint?.trim() || '';
  const email = form.dataset.email?.trim() || '';
  let messages: Record<string, string> = {};
  try {
    messages = JSON.parse(form.dataset.messages || '{}');
  } catch {
    messages = {};
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    if (!status) return;

    const data = new FormData(form);
    if (data.get('company')) return; // honeypot

    status.dataset.state = '';
    status.textContent = messages.sending || '…';

    if (endpoint) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          body: data,
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) throw new Error('request failed');
        status.dataset.state = 'ok';
        status.textContent = messages.ok || 'OK';
        form.reset();
      } catch {
        status.dataset.state = 'err';
        status.textContent = messages.err || 'Error';
      }
      return;
    }

    if (email) {
      const subject = encodeURIComponent(`FZA3HA — ${String(data.get('name') || '')}`);
      const body = encodeURIComponent(`${String(data.get('message') || '')}\n\n— ${String(data.get('email') || '')}`);
      window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
      status.dataset.state = 'ok';
      status.textContent = messages.mailto || 'Opening mail app…';
      return;
    }

    status.dataset.state = 'err';
    status.textContent = messages.none || 'Not configured';
  });
}

/* ---------- current year ---------- */
document.querySelectorAll<HTMLElement>('[data-year]').forEach((el) => {
  el.textContent = String(new Date().getFullYear());
});

/* ---------- hero 3d scene (lazy) ---------- */
const canvas = document.getElementById('heroCanvas') as HTMLCanvasElement | null;
if (canvas) {
  const load = () => {
    import('./scene')
      .then(({ initHeroScene }) => initHeroScene(canvas))
      .catch((error) => console.warn('[fza3ha] 3D scene unavailable', error));
  };

  if ('requestIdleCallback' in window) {
    (window as unknown as { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void }).requestIdleCallback(
      load,
      { timeout: 2200 },
    );
  } else {
    window.setTimeout(load, 700);
  }
}
