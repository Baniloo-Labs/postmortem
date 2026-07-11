// The web dashboard — a single self-contained HTML page, embedded in the binary
// as a string so it works identically under tsx (dev), tsup (build), and vitest
// (tests) with no asset-loader configuration. Fastify serves it from memory.
//
// Dark #0D0D0D / yellow #FFD93D / monospace, 240px sidebar, live SSE event feed.
// The inline script deliberately uses no backticks or ${...} so it nests cleanly
// inside this TypeScript template literal.

export const DASHBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>postmortem ☠</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
<style>
  :root {
    --bg:#0D0D0D; --surface:#141414; --border:#1E1E1E; --brand:#FFD93D; --brand-dim:#B89A2A;
    --text:#EEEEEE; --muted:#888888; --dim:#444444;
    --critical:#FF4444; --error:#FF6B6B; --warning:#FF922B; --success:#51CF66; --info:#74C0FC; --sensor:#34D399;
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text);
    font-family:'JetBrains Mono','Fira Code','Cascadia Code',monospace; font-size:14px; line-height:1.6; }
  a { color:inherit; text-decoration:none; }
  .layout { display:flex; min-height:100vh; }
  .sidebar { width:240px; flex:0 0 240px; border-right:1px solid var(--border); padding:20px 16px; position:sticky; top:0; height:100vh; }
  .logo { color:var(--brand); font-size:28px; font-weight:500; }
  .brand { color:var(--brand); font-weight:500; }
  .ver { color:var(--dim); font-size:12px; margin-bottom:16px; }
  .sensors-mini { margin:14px 0; border-top:1px solid var(--border); padding-top:12px; }
  .dot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:8px; }
  .nav { margin-top:16px; border-top:1px solid var(--border); padding-top:12px; }
  .nav a { display:block; padding:6px 8px; color:var(--muted); border-radius:4px; }
  .nav a.active { color:var(--brand); }
  .nav a:hover { color:var(--text); }
  .foot { position:absolute; bottom:16px; color:var(--dim); font-size:12px; }
  main { flex:1; padding:28px 32px; max-width:1100px; }
  h2 { font-weight:500; color:var(--muted); text-transform:uppercase; letter-spacing:1px; font-size:12px; }
  .card { background:var(--surface); border:1px solid var(--border); border-radius:6px; padding:16px; margin-bottom:12px; }
  .incident-card { border-color:var(--brand); }
  .row { display:flex; gap:10px; padding:3px 0; font-size:13px; }
  .ts { color:var(--dim); }
  .src { color:var(--sensor); }
  .sev-critical { color:var(--critical); } .sev-error { color:var(--error); }
  .sev-warning { color:var(--warning); } .sev-info { color:var(--info); }
  .badge { display:inline-block; padding:1px 8px; border-radius:10px; font-size:11px; border:1px solid var(--border); }
  .ai { color:var(--brand); font-weight:500; }
  .muted { color:var(--muted); } .dim { color:var(--dim); }
  .feed { max-height:60vh; overflow:auto; }
  .clickable { cursor:pointer; }
  .clickable:hover { border-color:var(--brand-dim); }
</style>
</head>
<body>
<div class="layout">
  <aside class="sidebar">
    <div class="logo">☠</div>
    <div class="brand">postmortem</div>
    <div class="ver" id="ver">v—</div>
    <div class="sensors-mini" id="sensors-mini"></div>
    <nav class="nav" id="nav">
      <a href="#/">Overview</a>
      <a href="#/incidents">Incidents</a>
      <a href="#/sensors">Sensors</a>
      <a href="#/predict">Predict</a>
    </nav>
    <div class="foot">127.0.0.1:6660</div>
  </aside>
  <main id="view"></main>
</div>
<script>
(function () {
  var view = document.getElementById('view');
  function esc(s){ var d=document.createElement('div'); d.textContent = s==null?'':String(s); return d.innerHTML; }
  function get(url){ return fetch(url).then(function(r){ return r.json(); }); }
  function sevClass(s){ return 'sev-' + (s||'info'); }
  function clock(iso){ var d=new Date(iso); return isNaN(d)? esc(iso) : d.toTimeString().slice(0,8); }

  function setActiveNav(hash){
    var links = document.querySelectorAll('#nav a');
    for (var i=0;i<links.length;i++){ links[i].className = (links[i].getAttribute('href')===hash)?'active':''; }
  }

  function renderSensorsMini(sensors){
    var html='';
    for (var i=0;i<sensors.length;i++){
      var s=sensors[i]; var color = s.healthy ? 'var(--sensor)' : 'var(--dim)';
      html += '<div><span class="dot" style="background:'+color+'"></span>'+esc(s.name)+'</div>';
    }
    document.getElementById('sensors-mini').innerHTML = html || '<span class="dim">no sensors</span>';
  }

  function eventRow(e){
    return '<div class="row"><span class="ts">'+clock(e.timestamp)+'</span>'
      + '<span class="src">'+esc(e.source)+'</span>'
      + '<span class="'+sevClass(e.severity)+'">'+esc(e.summary)+'</span></div>';
  }

  // --- Views ---
  function overview(){
    setActiveNav('#/');
    view.innerHTML = '<h2>Live events</h2><div class="card feed" id="feed"><span class="dim">waiting…</span></div>'
      + '<h2>Last incident</h2><div id="last-incident"><span class="dim">none yet</span></div>';
    get('/api/events').then(function(rows){
      var feed=document.getElementById('feed');
      if(!rows.length){ feed.innerHTML='<span class="dim">no events yet</span>'; return; }
      feed.innerHTML = rows.map(eventRow).join('');
    });
    get('/api/incidents').then(function(rows){
      if(!rows.length) return;
      var i=rows[0];
      document.getElementById('last-incident').innerHTML = incidentCardHtml(i);
    });
  }

  function incidentCardHtml(i){
    var html = '<div class="card incident-card clickable" onclick="location.hash=\\'#/incidents/'+esc(i.id)+'\\'">'
      + '<div><span class="ai">☠ '+esc(i.title)+'</span> <span class="badge '+sevClass(i.severity)+'">'+esc(i.severity)+'</span></div>';
    if(i.root_cause) html += '<div class="muted">'+esc(i.root_cause)+'</div>';
    html += '</div>';
    return html;
  }

  function incidents(){
    setActiveNav('#/incidents');
    view.innerHTML = '<h2>Incidents</h2><div id="list"><span class="dim">loading…</span></div>';
    get('/api/incidents').then(function(rows){
      var list=document.getElementById('list');
      if(!rows.length){ list.innerHTML='<span class="dim">no incidents recorded yet — postmortem learns as it watches</span>'; return; }
      list.innerHTML = rows.map(incidentCardHtml).join('');
    });
  }

  function incidentDetail(id){
    setActiveNav('#/incidents');
    view.innerHTML = '<div id="detail"><span class="dim">loading…</span></div>';
    get('/api/incidents/'+encodeURIComponent(id)).then(function(i){
      if(!i || i.error){ document.getElementById('detail').innerHTML='<span class="dim">not found</span>'; return; }
      var h = '<h2>Incident</h2><div class="card incident-card">'
        + '<div><span class="ai">☠ '+esc(i.title)+'</span> <span class="badge '+sevClass(i.severity)+'">'+esc(i.severity)+'</span></div>'
        + '<div class="dim">detected '+esc(i.detected_at)+'</div>';
      if(i.root_cause) h += '<div style="margin-top:10px"><span class="ai">☠ ROOT CAUSE</span><div>'+esc(i.root_cause)+'</div></div>';
      if(i.suggested_action) h += '<div style="margin-top:10px"><span class="ai">☠ SUGGESTED ACTION</span><div>'+esc(i.suggested_action)+'</div></div>';
      var tl = i.timeline || [];
      if(tl.length){ h += '<div style="margin-top:10px" class="muted">TIMELINE</div>';
        for(var k=0;k<tl.length;k++){ h += '<div class="row"><span class="ts">'+esc(tl[k].time)+'</span><span class="src">'+esc(tl[k].source)+'</span><span>'+esc(tl[k].text)+'</span></div>'; } }
      if(i.postmortem_path) h += '<div class="dim" style="margin-top:10px">report → '+esc(i.postmortem_path)+'</div>';
      h += '</div>';
      document.getElementById('detail').innerHTML = h;
    });
  }

  function sensors(){
    setActiveNav('#/sensors');
    view.innerHTML = '<h2>Sensors</h2><div id="slist"><span class="dim">loading…</span></div>';
    get('/api/sensors').then(function(rows){
      renderSensorsMini(rows);
      document.getElementById('slist').innerHTML = rows.map(function(s){
        var color = s.healthy ? 'var(--sensor)' : 'var(--dim)';
        return '<div class="card"><span class="dot" style="background:'+color+'"></span><b>'+esc(s.name)+'</b> <span class="muted">'+esc(s.message)+'</span></div>';
      }).join('');
    });
  }

  function predict(){
    setActiveNav('#/predict');
    view.innerHTML = '<h2>Predict</h2><div class="card"><span class="ai">☠</span> Run <b>mort predict</b> in your terminal to risk-score your current diff against your incident history before pushing.</div>';
  }

  function route(){
    var h = location.hash || '#/';
    if (h.indexOf('#/incidents/')===0) return incidentDetail(h.slice('#/incidents/'.length));
    if (h==='#/incidents') return incidents();
    if (h==='#/sensors') return sensors();
    if (h==='#/predict') return predict();
    return overview();
  }

  // --- Live stream ---
  var stream = new EventSource('/api/stream');
  stream.onmessage = function(ev){
    try {
      var e = JSON.parse(ev.data);
      var feed = document.getElementById('feed');
      if (feed) {
        if (feed.querySelector('.dim')) feed.innerHTML='';
        feed.insertAdjacentHTML('afterbegin', eventRow(e));
      }
      if (e.type === 'incident.detected' && (location.hash==='#/' || location.hash==='')) {
        get('/api/incidents').then(function(rows){ if(rows.length){ var el=document.getElementById('last-incident'); if(el) el.innerHTML=incidentCardHtml(rows[0]); } });
      }
    } catch (err) {}
  };

  // --- Boot ---
  get('/api/status').then(function(s){ document.getElementById('ver').textContent = 'v'+(s.version||'—'); });
  get('/api/sensors').then(renderSensorsMini);
  window.addEventListener('hashchange', route);
  route();
})();
</script>
</body>
</html>`;
