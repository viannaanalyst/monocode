/** Scripts run inside the embedded page. Keep them self-contained. */

export const BROWSER_PROBE_JS = `(() => {
  if (window.__mcBrowser) return "ok";
  const buf = { console: [], network: [] };
  window.__mcBrowser = buf;
  const wrap = (level) => {
    const orig = console[level];
    console[level] = function () {
      try {
        buf.console.push({
          level,
          text: Array.from(arguments).map(String).join(" ").slice(0, 500),
          t: Date.now(),
        });
        if (buf.console.length > 200) buf.console.shift();
      } catch (e) {}
      return orig.apply(console, arguments);
    };
  };
  ["log", "info", "warn", "error"].forEach(wrap);
  const origFetch = window.fetch;
  window.fetch = function () {
    const input = arguments[0];
    const url = typeof input === "string" ? input : (input && input.url) || String(input);
    const started = Date.now();
    return origFetch.apply(this, arguments).then((res) => {
      buf.network.push({
        url: String(url).slice(0, 300),
        status: res.status,
        method: "GET",
        t: started,
      });
      if (buf.network.length > 80) buf.network.shift();
      return res;
    });
  };
  return "ok";
})()`;

export const BROWSER_SNAPSHOT_JS = `(() => ({
  url: location.href,
  title: document.title,
  text: (document.body && document.body.innerText || "").slice(0, 8000),
  links: Array.from(document.querySelectorAll("a[href]")).slice(0, 40).map((a) => ({
    href: a.href,
    text: (a.textContent || "").trim().slice(0, 80),
  })),
}))()`;

export const BROWSER_CONSOLE_JS = `(() => (window.__mcBrowser && window.__mcBrowser.console) || [])()`;

export const BROWSER_NETWORK_JS = `(() => (window.__mcBrowser && window.__mcBrowser.network) || [])()`;

export function clickScript(selector: string, kind: "click" | "dblclick" | "hover"): string {
  return `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return { ok: false, error: "No element matches that selector." };
    el.scrollIntoView({ block: "center", inline: "nearest" });
    const opts = { bubbles: true, cancelable: true, view: window };
    if (${JSON.stringify(kind)} === "hover") {
      el.dispatchEvent(new MouseEvent("mouseover", opts));
      el.dispatchEvent(new MouseEvent("mouseenter", { ...opts, bubbles: false }));
      return { ok: true };
    }
    if (${JSON.stringify(kind)} === "dblclick") {
      el.dispatchEvent(new MouseEvent("click", opts));
      el.dispatchEvent(new MouseEvent("click", opts));
      el.dispatchEvent(new MouseEvent("dblclick", opts));
      return { ok: true };
    }
    el.dispatchEvent(new MouseEvent("click", opts));
    el.click();
    return { ok: true };
  })()`;
}

export function typeScript(selector: string, text: string): string {
  return `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return { ok: false, error: "No element matches that selector." };
    el.focus();
    const value = ${JSON.stringify(text)};
    if ("value" in el) {
      const proto = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(el),
        "value",
      );
      if (proto && proto.set) proto.set.call(el, value);
      else el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } else if (el.isContentEditable) {
      el.textContent = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      el.textContent = value;
    }
    return { ok: true };
  })()`;
}

export function scrollScript(dy: number, selector?: string): string {
  return `(() => {
    const dy = ${JSON.stringify(dy)};
    const sel = ${JSON.stringify(selector ?? "")};
    const el = sel ? document.querySelector(sel) : null;
    if (sel && !el) return { ok: false, error: "No element matches that selector." };
    (el || window).scrollBy({ top: dy, behavior: "instant" });
    return { ok: true };
  })()`;
}
