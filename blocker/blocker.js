/*
DevToolsGuard – Ultra-Aggressive Client-Side DevTools Defense
------------------------------------------------------------------------------
Features
--------
• Context menu blocking
• DevTools keyboard shortcut blocking
• Undetectable Timing Attack
• DevTools viewport size detection
• Immediate page wiping (clears content to prevent inspection)
• Redirects to YouTube on violation, preserving login and back-button functionality.
*/

(function DevToolsGuard() {
"use strict";

const CONFIG = {
    redirectURL: "https://www.youtube.com/embed/wlTx6XVBGhU?autoplay=1&mute=1",
    aggressiveMode: true
};

function executePunishment(){
    // IMPORTANT: Stop all further page activity immediately
    try { window.stop(); } catch(e) {}
    
    // IMPORTANT: Wipe the current page content so there's nothing left to inspect or interact with
    try {
        if (document.body) document.body.innerHTML = "";
        if (document.head) document.head.innerHTML = "";
    } catch(e) {}

    // IMPORTANT: Use top.location to ensure we break out of any iframes and redirect the current tab
    // We use href instead of replace to allow the user to click "back" to return (as previously requested).
    // We do NOT clear storage to preserve login state.
    try { 
        window.top.location.href = CONFIG.redirectURL; 
    } catch(e) { 
        window.location.href = CONFIG.redirectURL; 
    }
}

/* ================================
   LAYER 1 – USER INPUT BLOCKING
================================ */
function blockUserInteractions(){
    // Block context menu
    window.addEventListener("contextmenu", function(e){
        e.preventDefault();
        e.stopPropagation();
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
            e.stopPropagation();
            executePunishment();
        }
    }, { capture: true });
}

/* ================================
   LAYER 2 – UNDOCKED DEVTOOLS TIMING ATTACK
================================ */
// Breakpoint debuggers can be turned off in DevTools.
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
   LAYER 3 – VIEWPORT SIZE CHECK (Docked Trap)
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
   INITIALIZE SYSTEM
================================ */
function init(){
    blockUserInteractions();
    startTimingAttack();
    startViewportDetection();
}

// Check if document is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

})();
