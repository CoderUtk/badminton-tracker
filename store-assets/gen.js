const fs = require("fs");
const path = require("path");

const RAW = path.join(__dirname, "raw");
const OUT = path.join(__dirname, "composite");
fs.mkdirSync(OUT, { recursive: true });

const C = {
  bg: "#0C0E12",
  text: "#F2F4F8",
  text2: "#9BA3B2",
  red: "#FF3B30",
  accent: "#22D3EE",
};

const screens = [
  { file: "home", headline: "Home", body: "Your next session and quick stats, at a glance." },
  { file: "sessions", headline: "Sessions", body: "Plan practice, track attendance, run drills." },
  { file: "matches", headline: "Matches", body: "Score live matches, keep history, see form." },
  { file: "bracket", headline: "Tournaments", body: "Run brackets, track standings, share results.", out: "tournaments" },
  { file: "profile", headline: "Profile", body: "Your stats, badges, and account settings.", maskEmail: true },
];

const template = (b64, headline, body, maskEmail) => `<!doctype html>
<html><head><meta charset="utf-8">
<style>
@import url('https://fonts.googleapis.com/css2?family=Russo+One&family=Chakra+Petch:wght@400;600&display=swap');
* { margin:0; padding:0; box-sizing:border-box; }
html,body { width:1080px; height:1920px; background:${C.bg}; overflow:hidden; }
body {
  position:relative;
  background:
    radial-gradient(ellipse 130% 55% at 50% -8%, rgba(34,211,238,0.16), transparent 60%),
    radial-gradient(ellipse 90% 40% at 88% 6%, rgba(255,59,48,0.11), transparent 60%),
    linear-gradient(180deg, #0F1319 0%, #0A0C10 45%, #0C0E12 100%);
  font-family: 'Chakra Petch', sans-serif;
}
.emailmask {
  position:absolute; top:308px; left:137px; width:330px; height:40px;
  background:#171A21; border-radius:6px;
}
.headline {
  position:absolute; top:110px; left:0; right:0; text-align:center;
  font-family:'Russo One', sans-serif; font-size:76px; color:${C.text};
  letter-spacing:1px;
}
.body {
  position:absolute; top:220px; left:140px; right:140px; text-align:center;
  font-size:34px; color:${C.text2}; line-height:1.4; font-weight:400;
}
.frame {
  position:absolute; top:340px; left:215px; width:650px; height:1444px;
  background:#050608; border-radius:60px; padding:14px;
  box-shadow: 0 0 60px rgba(34,211,238,0.25), 0 30px 80px rgba(0,0,0,0.6);
  border: 1px solid rgba(255,255,255,0.08);
}
.frame img {
  width:100%; height:100%; object-fit:cover; border-radius:46px; display:block;
}
.brand {
  position:absolute; bottom:70px; left:0; right:0; text-align:center;
  font-family:'Russo One', sans-serif; font-size:34px; color:${C.text2}; letter-spacing:2px;
}
.brand span { color:${C.red}; }
</style></head>
<body>
  <div class="headline">${headline}</div>
  <div class="body">${body}</div>
  <div class="frame"><img src="data:image/png;base64,${b64}">${maskEmail ? '<div class="emailmask"></div>' : ""}</div>
  <div class="brand">COURT<span>SIDE</span></div>
</body></html>`;

for (const s of screens) {
  const b64 = fs.readFileSync(path.join(RAW, `${s.file}.b64`), "utf8");
  const html = template(b64, s.headline, s.body, s.maskEmail);
  const outName = s.out || s.file;
  fs.writeFileSync(path.join(OUT, `${outName}.html`), html);
  console.log("wrote", outName);
}
