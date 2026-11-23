
/* ---------------------------------------------------------------------------
 * Live catalogue, served by the store admin to a website that is not its own storefront.
 *
 * Add it to such a site with one line, after the file that defines window.BD_PRODUCTS:
 *   document.head.appendChild(Object.assign(document.createElement("script"),
 *     { src: "https://<store>/api/public/storefront.js", async: true }));
 *
 * The site's own product list is what its pages ship with: it renders instantly and is what
 * search engines read. Straight after load we ask the admin for the current
 * prices and stock and, when they differ, update both the cart's data and the
 * numbers printed on the page. So a price changed in the admin shows here on
 * the next page load, and if the admin is ever unreachable the site simply
 * keeps the prices it was published with.
 *
 * Products added or removed in the admin do NOT appear or disappear here: the
 * cards are part of the page. Those still need a publish.
 * ------------------------------------------------------------------------- */
(function () {
  "use strict";
  var here = document.currentScript && document.currentScript.src;
  var API = (here ? here.replace(/storefront\.js.*$/, "") : "/api/public/") + "products";

  function money(n) {
    return "\u20B9" + Math.round(n).toLocaleString("en-IN");
  }
  function perUnit(price, qty) {
    return "\u20B9" + (price / qty).toFixed(2);
  }
  function offPercent(price, mrp) {
    return Math.round((1 - price / mrp) * 100) + "% off";
  }
  /** Replaces the n-th rupee amount in a piece of text, leaving every other word alone. */
  function replaceAmount(text, index, value) {
    var seen = -1;
    return text.replace(/\u20B9[\d.,]+/g, function (match) {
      seen++;
      return seen === index ? value : match;
    });
  }

  function mergeInto(local, live) {
    // The cart holds references to these objects, so updating them in place is
    // all it takes for totals, the drawer and checkout to use the new prices.
    live.forEach(function (fresh) {
      var p = local.find(function (x) { return x.id === fresh.id; });
      if (!p) return;
      (fresh.variants || []).forEach(function (fv) {
        var v = (p.variants || []).find(function (x) { return x.qty === fv.qty; });
        if (!v) return;
        if (typeof fv.price === "number") v.price = fv.price;
        if (typeof fv.mrp === "number") v.mrp = fv.mrp;
        v.stock = fv.stock;
      });
      if (p.variants && p.variants.length) p.price = p.variants[0].price;
    });
  }

  function priceOf(id, qty) {
    var p = (window.BD_PRODUCTS || []).find(function (x) { return x.id === id; });
    if (!p) return null;
    var v = (p.variants || []).find(function (x) { return x.qty === qty; }) || p.variants[0];
    return v ? { v: v, unit: (p.unit || "pieces").replace(/s$/, "") } : null;
  }

  /** Product cards on the shop, the home page and the "you may also like" rows. */
  function syncCards() {
    document.querySelectorAll("article[data-price]").forEach(function (card) {
      var btn = card.querySelector("[data-add]");
      var box = card.querySelector(".price");
      if (!btn || !box) return;
      var found = priceOf(btn.dataset.add, Number(card.dataset.pack || 0) || undefined);
      if (!found) return;
      var v = found.v;

      for (var i = 0; i < box.childNodes.length; i++) {
        var node = box.childNodes[i];
        if (node.nodeType === 3 && node.textContent.indexOf("\u20B9") !== -1) {
          node.textContent = money(v.price);
          break;
        }
      }
      var mrp = box.querySelector(".mrp");
      var off = box.querySelector(".off");
      if (mrp) {
        if (v.mrp && v.mrp > v.price) { mrp.textContent = money(v.mrp); mrp.hidden = false; }
        else { mrp.hidden = true; }
      }
      if (off) {
        if (v.mrp && v.mrp > v.price) { off.textContent = offPercent(v.price, v.mrp); off.hidden = false; }
        else { off.hidden = true; }
      }
      card.dataset.price = String(v.price);
    });
  }

  /** The big price and the pack buttons on a product page. */
  function syncProductPage() {
    var main = document.querySelector("[data-add][data-pack]");
    if (!main) return;
    var id = main.dataset.add;

    document.querySelectorAll("button.pack[data-q]").forEach(function (pack) {
      var found = priceOf(id, Number(pack.dataset.q));
      if (!found) return;
      var v = found.v;
      var pp = pack.querySelector(".pp");
      var pm = pack.querySelector(".pm");
      if (pp) pp.textContent = money(v.price);
      if (pm) {
        var text = pm.textContent;
        text = replaceAmount(text, 0, v.mrp && v.mrp > v.price ? money(v.mrp) : money(v.price));
        text = replaceAmount(text, 1, perUnit(v.price, v.qty));
        pm.textContent = text;
      }
    });

    var big = document.querySelector(".price-lg");
    if (!big) return;
    var current = priceOf(id, Number(main.dataset.pack));
    if (!current) return;
    var cv = current.v;
    var strong = big.querySelector("span:not(.mrp):not(.off)");
    if (strong) strong.textContent = money(cv.price);
    var bmrp = big.querySelector(".mrp");
    var boff = big.querySelector(".off");
    if (bmrp) {
      if (cv.mrp && cv.mrp > cv.price) { bmrp.textContent = replaceAmount(bmrp.textContent, 0, money(cv.mrp)); bmrp.hidden = false; }
      else { bmrp.hidden = true; }
    }
    if (boff) {
      if (cv.mrp && cv.mrp > cv.price) { boff.textContent = offPercent(cv.price, cv.mrp); boff.hidden = false; }
      else { boff.hidden = true; }
    }
    var note = big.querySelector("small");
    if (note) note.textContent = replaceAmount(note.textContent, 0, perUnit(cv.price, cv.qty));
  }

  function apply(live) {
    mergeInto(window.BD_PRODUCTS || [], live || []);
    try { syncCards(); } catch (e) {}
    try { syncProductPage(); } catch (e) {}
    document.dispatchEvent(new CustomEvent("bd:catalogue"));
  }

  window.BD_CATALOGUE = fetch(API, { cache: "no-store" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      if (!data || !data.ok || !Array.isArray(data.products)) return;
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () { apply(data.products); });
      } else {
        apply(data.products);
      }
    })
    .catch(function () { /* admin unreachable: the published prices stay */ });
})();
