// ===== Servidor de Pedidos D'Cesar =====
// API REST + SQLite (sql.js, sem compilação nativa) com persistência em arquivo
const express = require('express');
const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || '.';
if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, {recursive:true});
const DB_FILE = path.join(DATA_DIR, 'pedidos.db');

const app = express();
app.use(express.json({limit:'15mb'}));
app.use(express.static('public'));

let db = null;
let salvarTimer = null;

function persistir(){
  // grava o banco em disco (debounce 500ms)
  clearTimeout(salvarTimer);
  salvarTimer = setTimeout(()=>{
    const data = db.export();
    fs.writeFileSync(DB_FILE, Buffer.from(data));
  }, 500);
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS pedidos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  num TEXT UNIQUE, data TEXT, cliente TEXT, telefone TEXT, vendedora TEXT,
  pagamento TEXT, entrega TEXT, obs TEXT, layout TEXT, itens TEXT,
  pecas INTEGER, peso REAL, total REAL, sinal REAL, saldo REAL,
  pago INTEGER DEFAULT 0, criado_em TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS seq (id INTEGER PRIMARY KEY, valor INTEGER);
INSERT OR IGNORE INTO seq (id, valor) VALUES (1, 0);
`;

function proximoNum(){
  db.run('UPDATE seq SET valor = valor + 1 WHERE id = 1');
  const r = db.exec('SELECT valor FROM seq WHERE id = 1');
  return String(r[0].values[0][0]).padStart(4,'0');
}

function rowToPedido(r){
  const cols = ['id','num','data','cliente','telefone','vendedora','pagamento','entrega','obs','layout','itens','pecas','peso','total','sinal','saldo','pago','criado_em'];
  const o = {};
  cols.forEach((c,i)=>o[c]=r[i]);
  o.itens = JSON.parse(o.itens||'[]');
  o.pago = !!o.pago;
  return o;
}

initSqlJs().then(SQL=>{
  if(fs.existsSync(DB_FILE)){
    db = new SQL.Database(fs.readFileSync(DB_FILE));
  } else {
    db = new SQL.Database();
  }
  db.run(SCHEMA);
  persistir();

  // ===== API =====
  app.get('/api/pedidos', (req,res)=>{
    const r = db.exec('SELECT * FROM pedidos ORDER BY id DESC');
    const pedidos = r.length ? r[0].values.map(rowToPedido) : [];
    res.json(pedidos);
  });

  app.post('/api/pedidos', (req,res)=>{
    const p = req.body;
    if(!p.cliente || !Array.isArray(p.itens)) return res.status(400).json({erro:'cliente e itens obrigatórios'});
    const num = proximoNum();
    db.run(`INSERT INTO pedidos (num,data,cliente,telefone,vendedora,pagamento,entrega,obs,layout,itens,pecas,peso,total,sinal,saldo,pago)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [num, p.data||'', p.cliente, p.telefone||'', p.vendedora||'', p.pagamento||'', p.entrega||'',
       p.obs||'', p.layout||'', JSON.stringify(p.itens), p.pecas||0, p.peso||0, p.total||0, p.sinal||0, p.saldo||0, p.pago?1:0]);
    persistir();
    res.json({ok:true, num});
  });

  app.patch('/api/pedidos/:num/pago', (req,res)=>{
    const r = db.exec('SELECT pago FROM pedidos WHERE num='+JSON.stringify(req.params.num));
    if(!r.length) return res.status(404).json({erro:'não encontrado'});
    const novo = r[0].values[0][0] ? 0 : 1;
    db.run('UPDATE pedidos SET pago='+novo+' WHERE num='+JSON.stringify(req.params.num));
    persistir();
    res.json({ok:true, pago:!!novo});
  });

  app.delete('/api/pedidos/:num', (req,res)=>{
    db.run('DELETE FROM pedidos WHERE num='+JSON.stringify(req.params.num));
    persistir();
    res.json({ok:true});
  });

  const PORT = process.env.PORT || 3210;
  app.listen(PORT, ()=>console.log('Servidor de pedidos D\'Cesar na porta', PORT));
});
