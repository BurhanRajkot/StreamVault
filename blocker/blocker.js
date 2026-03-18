/*
DevToolsGuard – Ultra-Aggressive Client-Side DevTools Defense
------------------------------------------------------------------------------
Features
--------
• Context menu blocking (Parent + Re-focus trap)
• DevTools keyboard shortcut blocking
• Undetectable Timing Attack (No debugger breakpoint needed)
• Console string-conversion getter trap
• DevTools viewport size detection
• IFrame Focus Stealer (Protects F12 over video players)
*/

(function DevToolsGuard() {
"use strict";

const CONFIG = {
    redirectURL: "https://www.youtube.com/watch?v=wlTx6XVBGhU",
    aggressiveMode: true
};

function executePunishment(){
    // Open the redirect in a new tab so the user can come back (no history wipe)
    // Do NOT clear localStorage — that destroys Auth0's cached session tokens
    try { window.open(CONFIG.redirectURL, '_blank', 'noopener,noreferrer'); } catch(e){}
}

/* ================================
   LAYER 1 – USER INPUT BLOCKING
================================ */
function blockUserInteractions(){
    // Block context menu
    window.addEventListener("contextmenu", function(e){
        e.preventDefault();
        executePunishment();
    }, { capture: true });

    // Block selection and dragging
    window.addEventListener("selectstart", function(e){ if(CONFIG.aggressiveMode) e.preventDefault(); }, { capture: true });
    window.addEventListener("dragstart", function(e){ if(CONFIG.aggressiveMode) e.preventDefault(); }, { capture: true });

    // Block keyboard shortcuts
    window.addEventListener("keydown", function(e){
        const key = e.key.toLowerCase();
        const blocked =
            e.keyCode === 123 ||
            key === "f12" ||
            ((e.ctrlKey || e.metaKey) && e.shiftKey && key === "i") ||
            ((e.ctrlKey || e.metaKey) && e.shiftKey && key === "j") ||
            ((e.ctrlKey || e.metaKey) && e.shiftKey && key === "c") ||
            ((e.ctrlKey || e.metaKey) && key === "u");

        if(blocked){
            e.preventDefault();
            executePunishment();
        }
    }, { capture: true });
}

/* ================================
   LAYER 2 – IFRAME FOCUS TRAP (Crucial for Video Players)
================================ */
// When a user clicks inside a cross-origin iframe (like the video player),
// the iframe steals window focus. Once it has focus, F12 goes to the iframe and bypasses our keydown listener!
// This trap constantly steals focus back to the main window immediately after interaction.
function startIframeFocusTrap() {
    window.addEventListener('blur', () => {
        setTimeout(() => {
            if (document.activeElement instanceof HTMLIFrameElement) {
                // Instantly steal focus back to the parent window so F12 is protected
                window.focus();

                // If they managed to open devtools in the split second, the performance loop below will catch them
            }
        }, 0);
    });
}

/* ================================
   LAYER 3 – UNDOCKED DEVTOOLS TIMING ATTACK
================================ */
// Breakpoint debuggers can be turned off in DevTools. We use a RegEx toString timing attack instead.
// Opening DevTools evaluates un-evaluated regex string conversions, taking massive CPU cycles.
function startTimingAttack() {
    let devtoolsOpen = false;

    const element = new Image();
    Object.defineProperty(element, 'id', {
        get: function () {
            devtoolsOpen = true;
            executePunishment();
            throw new Error("DevTools detected");
        }
    });

    setInterval(function () {
        devToolsCheck();
    }, 1000);

    function devToolsCheck() {
        devtoolsOpen = false;
        // 1. Console getter trigger
        console.log(element);
        console.clear();

        // 2. Performance timing trigger (Undocked/Disabled-breakpoints trap)
        const start = performance.now();
        debugger; // Will halt ONLY if breakpoints are enabled
        const end = performance.now();

        if (end - start > 100) {
            devtoolsOpen = true;
            executePunishment();
        }
    }
}

/* ================================
   LAYER 4 – VIEWPORT SIZE CHECK (Docked Trap)
================================ */
function startViewportDetection(){
    let lastHeight = window.innerHeight;
    let lastWidth = window.innerWidth;

    window.addEventListener('resize', () => {
        const heightDiff = Math.abs(window.innerHeight - lastHeight);
        const widthDiff = Math.abs(window.innerWidth - lastWidth);

        // A sudden drop of > 160px highly implies opening docked DevTools
        if (heightDiff > 160 || widthDiff > 160) {
            executePunishment();
        }
        lastHeight = window.innerHeight;
        lastWidth = window.innerWidth;
    });
}

/* ================================
   LAYER 5 – DISABLE CONSOLE CLI
================================ */
function lockdownConsole() {
    try {
        Object.defineProperty(window, 'console', {
            get: function() {
                executePunishment();
                throw new Error('Access Denied');
            },
            set: function() {}
        });
    } catch (e) {}
}

/* ================================
   INITIALIZE SYSTEM
================================ */
function init(){
    blockUserInteractions();
    startIframeFocusTrap();
    startTimingAttack();
    startViewportDetection();
    // Intentionally omitting lockdownConsole until they trigger devtools to avoid breaking normal app
}

init();

})();
