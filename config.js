/* =====================================================================
   FORTE – CMS MEDICAL CLAIMS · DIGITAL RIBBON CUTTING
   CONFIGURATION  (this is the only file you normally need to edit)
   ===================================================================== */
window.FORTE_CONFIG = {

  /* ---------------------------------------------------------------
     1. FIREBASE  — paste the "firebaseConfig" object from
        Firebase console › Project settings › Your apps › Web app.
        databaseURL MUST be present (Realtime Database URL).
     --------------------------------------------------------------- */
  firebase: {
    apiKey: "AIzaSyBFnJRvmqv7cIV1BRkY8MLKto87s30fNq8",
    authDomain: "ribbon-cutting-a00dd.firebaseapp.com",
    databaseURL: "https://ribbon-cutting-a00dd-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "ribbon-cutting-a00dd",
    storageBucket: "ribbon-cutting-a00dd.firebasestorage.app",
    messagingSenderId: "799187775824",
    appId: "1:799187775824:web:2b0acb26bdc6e3d3403c55"
  },

  /* ---------------------------------------------------------------
     2. CEREMONY SESSION  — used when a URL has no ?session=
     --------------------------------------------------------------- */
  defaultSession: "cms-medical-2026",

  /* Background music (an mp3 in assets/): plays until the ribbon is cut, goes quiet for the
     balloon bursts, then carries on through the final page. Missing file = a soft built-in pad. */
  musicUrl: "assets/alex-morgan-event-grand-opening-fanfare-578493.mp3",

  /* Show an on-page "Enable sound" notification until sound is unlocked?
     false = no notification; sound starts on the page's first click / tap / key press. */
  showSoundPrompt: false,

  /* Visual theme used when a URL has no ?theme= (only "light" is styled) */
  theme: "light",

  /* ---------------------------------------------------------------
     3. PARTICIPANTS  — edit the display NAMES freely.
        The IDs (sergei, chandana, business, kgisl, project) are also
        written in database.rules.json. If you change an ID, change it
        there too and re-publish the rules.
     --------------------------------------------------------------- */
  participants: [
    { id: "vannary", name: "MENG VANNARY" },
    { id: "chandana", name: "CHANDANA JAYASOORIYA" },
    { id: "channtharong", name: "SUY CHANNTHARONG" },
    { id: "sergei",   name: "SERGEI KOROL" },
    { id: "kgisl",    name: "MANOJ | KGISL" }
  ],

  /* ---------------------------------------------------------------
     4. FORTE LOGO
        Put the official logo file in the  assets/  folder and set its
        path here, e.g. "assets/forte-logo.png" (PNG or SVG, white or
        red-box version, ideally 600px wide or larger).
        Leave "" to use the built-in red "Forte" wordmark box.
     --------------------------------------------------------------- */
  logoUrl: "assets/logo-red.png",

  /* ---------------------------------------------------------------
     4b. SYSTEM SCREENSHOT REVEAL (after the cut, before the LIVE screen)
        The CMS screenshot rises out of the cut ribbon in a browser
        frame, then dissolves into the final LIVE screen.
        Replace assets/cms-system.jpg with any screenshot (16:9 is best)
        or set "" to switch the reveal off.
     --------------------------------------------------------------- */
  systemScreenshotUrl: "assets/cms-system.jpg",
  systemScreenshotLabel: "CMS – Medical Claims",
  companyName: "Forte Insurance (Cambodia) Plc.",

  /* ---------------------------------------------------------------
     5. CEREMONY TEXT (optional tweaks)
     --------------------------------------------------------------- */
  text: {
    system: "CMS – MEDICAL",
    title: "CMS – MEDICAL SYSTEM LAUNCH",
    date: "01 OCTOBER 2026",
    subtitle: "Transforming Medical Claims Management - Together",
    liveLine1: "Six months of teamwork, commitment and collaboration.",
    liveLine2: "Thank you to everyone who made this possible.",
    liveMotto: "One Team. One Journey. One Successful Go-Live."
  }
};