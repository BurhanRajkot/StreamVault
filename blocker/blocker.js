// /*
//   DevToolsGuard – Ultra-Hardened Client-Side DevTools Defense
//   ─────────────────────────────────────────────────────────────
//   Layers:
//     1. Keyboard shortcut blocking (keydown + keyup, ALL devtools combos)
//     2. Context-menu blocking
//     3. Text- select / drag blocking
//     4. Timing-attack detection (undocked DevTools)
//     5. Console-getter trap
//     6. IFrame focus-steal trap
//     7. Viewport shrink detection (docked DevTools) — conservative threshold
// */
// 
// ;(function DevToolsGuard() {
//   "use strict";
// 
//   /* ── CONFIG ───────────────────────────────────────────────── */
//   var REDIRECT_URL = "https://www.youtube.com/watch?v=wlTx6XVBGhU";
//   var VIEWPORT_THRESHOLD = 200; // px – must be large enough to ignore normal resizes
// 
//   /* ── PUNISHMENT ───────────────────────────────────────────── */
//   var _punishing = false;
//   function punish() {
//     if (_punishing) return;
//     _punishing = true;
//     try {
//       window.open(REDIRECT_URL, "_blank", "noopener,noreferrer");
//     } catch (_) {}
//     // Reset after 3 s so repeated triggers don't spam tabs
//     setTimeout(function () { _punishing = false; }, 3000);
//   }
// 
//   /* ── LAYER 1: KEYBOARD BLOCKING ───────────────────────────── */
//   // Normalises key regardless of Shift state and browser differences.
//   function isBlockedCombo(e) {
//     var k = (e.key || "").toLowerCase();
//     var code = e.keyCode || e.which || 0;
//     var ctrl = e.ctrlKey || e.metaKey; // metaKey = Cmd on Mac
//     var shift = e.shiftKey;
//     var alt = e.altKey;
// 
//     // — F12 —
//     if (code === 123 || k === "f12") return true;
// 
//     // — Ctrl/Cmd + Shift combos —
//     if (ctrl && shift) {
//       // I  – Chrome/Firefox Inspector (keyCode 73 / key "i")
//       if (k === "i" || code === 73) return true;
//       // J  – Chrome Console (keyCode 74 / key "j")
//       if (k === "j" || code === 74) return true;
//       // C  – Chrome Inspect element picker (keyCode 67 / key "c")
//       if (k === "c" || code === 67) return true;
//       // K  – Firefox Web Console shortcut
//       if (k === "k" || code === 75) return true;
//       // E  – Firefox Network panel shortcut
//       if (k === "e" || code === 69) return true;
//       // Delete – Firefox shortcut on some versions
//       if (k === "delete" || code === 46) return true;
//     }
// 
//     // — Ctrl/Cmd only combos —
//     if (ctrl && !shift && !alt) {
//       // U – View Source
//       if (k === "u" || code === 85) return true;
//       // S – Save Page (exposes source)
//       if (k === "s" || code === 83) return true;
//       // P – Print (can expose content)
//       if (k === "p" || code === 80) return true;
//       // A – Select All (not lethal but keep)
//       // if (k === "a" || code === 65) return true;  // Uncomment if desired
//     }
// 
//     // — Ctrl + Shift + U – GTK Inspector on Linux —
//     if (ctrl && shift && !alt && (k === "u" || code === 85)) return true;
// 
//     // — Alt + Cmd + I – Safari DevTools (Mac) —
//     if (alt && (e.metaKey) && (k === "i" || code === 73)) return true;
// 
//     return false;
//   }
// 
//   function handleKey(e) {
//     if (isBlockedCombo(e)) {
//       e.preventDefault();
//       e.stopPropagation();
//       e.stopImmediatePropagation();
//       punish();
//       return false;
//     }
//   }
// 
//   // Attach to BOTH keydown and keyup with capture=true so no handler below us fires first
//   window.addEventListener("keydown",  handleKey, { capture: true });
//   window.addEventListener("keyup",    handleKey, { capture: true });
//   // Also attach on document to catch any that slip through
//   document.addEventListener("keydown", handleKey, { capture: true });
//   document.addEventListener("keyup",   handleKey, { capture: true });
// 
//   /* ── LAYER 2: CONTEXT MENU ────────────────────────────────── */
//   window.addEventListener("contextmenu", function (e) {
//     e.preventDefault();
//     e.stopImmediatePropagation();
//     punish();
//   }, { capture: true });
// 
//   /* ── LAYER 3: SELECT / DRAG ───────────────────────────────── */
//   window.addEventListener("selectstart", function (e) { e.preventDefault(); }, { capture: true });
//   window.addEventListener("dragstart",   function (e) { e.preventDefault(); }, { capture: true });
// 
//   /* ── LAYER 4: CONSOLE-GETTER TRAP (open DevTools → punish) ── */
//   var _trap = new Image();
//   var _devOpen = false;
//   Object.defineProperty(_trap, "id", {
//     get: function () {
//       if (!_devOpen) {
//         _devOpen = true;
//         punish();
//       }
//       return "";
//     }
//   });
// 
//   setInterval(function () {
//     _devOpen = false;
//     console.log(_trap); // triggers the getter only when console is visible
//     console.clear();
//   }, 1500);
// 
//   /* ── LAYER 5: TIMING ATTACK (breakpoint / pause detection) ── */
//   setInterval(function () {
//     var t0 = performance.now();
//     // eslint-disable-next-line no-debugger
//     debugger; // halts only when user has DevTools open WITH breakpoints enabled
//     var elapsed = performance.now() - t0;
//     if (elapsed > 150) {
//       punish();
//     }
//   }, 2000);
// 
//   /* ── LAYER 6: IFRAME FOCUS TRAP ───────────────────────────── */
//   // When focus leaves to a cross-origin iframe (video player),
//   // F12 bypasses our keydown. Steal focus back immediately.
//   window.addEventListener("blur", function () {
//     setTimeout(function () {
//       if (document.activeElement instanceof HTMLIFrameElement) {
//         window.focus();
//       }
//     }, 0);
//   });
// 
//   /* ── LAYER 7: VIEWPORT SHRINK CHECK (docked DevTools) ──────── */
//   // Uses a snapshot every 800 ms rather than the resize event to avoid
//   // false-positives when the user merely resizes the browser window.
//   var _lastW = window.outerWidth;
//   var _lastH = window.outerHeight;
// 
//   setInterval(function () {
//     var w = window.outerWidth;
//     var h = window.outerHeight;
//     var dw = _lastW - w;
//     var dh = _lastH - h;
// 
//     // innerHeight shrinks but outerHeight stays same when DevTools docks.
//     // We compare the INNER vs OUTER gap instead of two resize snapshots.
//     var innerOuterGap = window.outerHeight - window.innerHeight;
// 
//     if (innerOuterGap > VIEWPORT_THRESHOLD) {
//       punish();
//     }
// 
//     _lastW = w;
//     _lastH = h;
//   }, 1000);
// 
// })();
