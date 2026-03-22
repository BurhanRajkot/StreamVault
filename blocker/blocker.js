/*
DevToolsGuard – Advanced Silent Telemetry and Execution Defense
------------------------------------------------------------------------------
Features
--------
• Null-Prototype Configuration
• Global Prototype Freezing
• MutationObserver DOM Integrity (Anti-Tamper & Anti-Garbage-Collection)
• Console Getter Trap
• Performance Timing Trap
• Silent Honey Mode Activation (No Popups / No Redirects)

NOTE: Standard user interactions (right-click, double-click, drag) are explicitly
ALLOWED to prevent false positives and annoyance.
*/

(function DevToolsGuard() {
"use strict";

/* ================================
   LAYER 1 – PROTOTYPE PROTECTIONS
================================ */
// Freeze the global prototypes to prevent Prototype Pollution
try {
    Object.freeze(Object.prototype);
    Object.freeze(Array.prototype);
} catch(e) {}

// Create a null-prototype configuration that cannot be polluted
const CONFIG = Object.create(null);
CONFIG.tampered = false;
CONFIG.observerConfig = { childList: true, subtree: true, attributes: true, characterData: true };
CONFIG.debuggerThreshold = 100;

// Initialize the global Honey Mode state container
if (!window.__PROTECTED_STATE) {
    Object.defineProperty(window, '__PROTECTED_STATE', {
        value: Object.create(null),
        writable: false,
        configurable: false,
        enumerable: false
    });
}
window.__PROTECTED_STATE.tampered = false;

/* ================================
   STRATEGIC RETALIATION - HONEY MODE
================================ */
function triggerHoneyMode(vector) {
    if (CONFIG.tampered) return;
    CONFIG.tampered = true;
    window.__PROTECTED_STATE.tampered = true;
    
    // Instead of alerting or redirecting, we silently note the environment is compromised.
    // The main application can check window.__PROTECTED_STATE.tampered asynchronously
    // to begin feeding fake, poisoned, or randomized data to the attacker.
    
    try {
        // Optional: Dispatch a silent custom event that the backend/app can catch
        const stealthEvent = new CustomEvent("core_metrics_ready", { detail: { v: vector } });
        document.dispatchEvent(stealthEvent);
    } catch(e) {}
}

/* ================================
   LAYER 2 – DOM INTEGRITY OBSERVER
================================ */
function startIntegrityObserver() {
    try {
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach((mutation) => {
                // Check for unauthorized injections (Bot extensions / scrapers)
                if (mutation.addedNodes && mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach(node => {
                        // Very basic heuristic check for injected automation scripts
                        if (node.tagName === 'SCRIPT' && node.id && node.id.includes('tamper')) {
                            triggerHoneyMode("inject");
                        }
                    });
                }

                // Check for unauthorized deletions (Attacker deleting the protective script tag)
                if (mutation.removedNodes && mutation.removedNodes.length > 0) {
                    mutation.removedNodes.forEach(node => {
                        if (node.tagName === 'SCRIPT' || node.id === 'app-root') {
                            triggerHoneyMode("delete");
                        }
                    });
                }
            });
        });

        // Attach to the documentElement (HTML tag) so the observer cannot be killed easily
        if (document.documentElement) {
            observer.observe(document.documentElement, CONFIG.observerConfig);
        }
    } catch(e) {}
}


/* ================================
   LAYER 3 – SIDE-CHANNEL TELEMETRY
================================ */
function startTelemetryTraps() {
    // 1. Console Getter Trap
    const trapElement = new Image();
    Object.defineProperty(trapElement, 'id', {
        get: function () {
            triggerHoneyMode("console_getter");
            return "trap-triggered";
        }
    });

    // 2. DevTools Scope Pane / Evaluation Trap
    // When DevTools parses the scope, it will trip this getter asynchronously
    let scopeTripwire = false;
    const scopeTrap = Object.create(null);
    Object.defineProperty(scopeTrap, 'eval', {
        get: function() {
            if (!scopeTripwire) {
                scopeTripwire = true;
                triggerHoneyMode("scope_evaluation");
            }
            return true;
        }
    });

    setInterval(function () {
        devToolsCheck(trapElement, scopeTrap);
    }, 1000);

    function devToolsCheck(el, st) {
        // Trigger console getter
        console.log(el);
        console.clear();

        // Scope trap referenced so the JS engine doesn't garbage collect it entirely
        if (st.eval) { /* NOOP */ }

        // Timing Trap
        const start = performance.now();
        debugger; // Only pauses if breakpoints are active
        const end = performance.now();

        if (end - start > CONFIG.debuggerThreshold) {
            triggerHoneyMode("timing_delay");
        }
    }
}


/* ================================
   INITIALIZE SYSTEM
================================ */
function init() {
    // Native interactions (clicks, contextmenu) are NOT touched to avoid disrupting normal users.
    startIntegrityObserver();
    startTelemetryTraps();
}

// Check if document is ready to attach observer to documentElement
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

})();
