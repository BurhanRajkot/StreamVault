<script>
/*
 DevToolsGuard – Professional Client-Side DevTools Detection & Blocking System
 ------------------------------------------------------------------------------

 Features
 --------
 • Context menu blocking
 • DevTools keyboard shortcut blocking
 • Debugger timing detection
 • Console getter detection
 • DevTools viewport size detection
 • Function integrity check
 • Storage wipe on detection
 • Forced redirect payload
*/

(function DevToolsGuard() {

"use strict";

/* ================================
   CONFIGURATION
================================ */

const CONFIG = {
    redirectURL: "https://www.youtube.com/embed/wlTx6XVBGhU?autoplay=1&mute=1",
    debuggerThreshold: 120,
    detectionInterval: 800,
    consoleTrapInterval: 1000,
    viewportThreshold: 160,
    aggressiveMode: true
};


/* ================================
   RESPONSE PAYLOAD
================================ */

function executePunishment(){

    try{
        localStorage.clear();
        sessionStorage.clear();
    }catch(e){}

    try{
        window.location.replace(CONFIG.redirectURL);
    }catch(e){
        window.location.href = CONFIG.redirectURL;
    }

}


/* ================================
   LAYER 1 – USER INPUT BLOCKING
================================ */

function blockUserInteractions(){

    document.addEventListener("contextmenu", function(e){
        e.preventDefault();
        executePunishment();
    });

    document.addEventListener("selectstart", function(e){
        if(CONFIG.aggressiveMode) e.preventDefault();
    });

    document.addEventListener("dragstart", function(e){
        if(CONFIG.aggressiveMode) e.preventDefault();
    });

    document.addEventListener("keydown", function(e){

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

    });

}


/* ================================
   LAYER 2 – DEBUGGER TIMING CHECK
================================ */

function startDebuggerDetection(){

    function detectDebugger(){

        const start = performance.now();

        debugger;

        const end = performance.now();

        if(end - start > CONFIG.debuggerThreshold){
            executePunishment();
        }

    }

    setInterval(detectDebugger, CONFIG.detectionInterval);

}


/* ================================
   LAYER 3 – CONSOLE TRAP
================================ */

function startConsoleTrap(){

    const trap = document.createElement("div");

    Object.defineProperty(trap,"id",{
        get:function(){
            executePunishment();
            return "devtools-detected";
        }
    });

    setInterval(function(){

        console.log(trap);
        console.clear();

    }, CONFIG.consoleTrapInterval);

}


/* ================================
   LAYER 4 – VIEWPORT SIZE CHECK
================================ */

function startViewportDetection(){

    setInterval(function(){

        const widthDiff =
            window.outerWidth - window.innerWidth;

        const heightDiff =
            window.outerHeight - window.innerHeight;

        if(widthDiff > CONFIG.viewportThreshold ||
           heightDiff > CONFIG.viewportThreshold){

            executePunishment();

        }

    }, CONFIG.detectionInterval);

}


/* ================================
   LAYER 5 – INTEGRITY CHECK
================================ */

function startIntegrityCheck(){

    const nativeToString = Function.prototype.toString;

    setInterval(function(){

        if(Function.prototype.toString !== nativeToString){
            executePunishment();
        }

    }, 2000);

}


/* ================================
   INITIALIZE SYSTEM
================================ */

function init(){

    blockUserInteractions();

    startDebuggerDetection();

    startConsoleTrap();

    startViewportDetection();

    startIntegrityCheck();

}

init();

})();
</script>
