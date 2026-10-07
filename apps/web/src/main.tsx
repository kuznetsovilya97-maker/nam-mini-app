import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type Task = { id:string; title:string; description:string; difficulty:'EASY'|'MEDIUM'|'HARD'; category:string; estimatedMinutes:number; budgetMax:number };
type Assignment = { id:string; task:Task; status:string; userId:string; slot:string; scheduledAt?:string };
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
declare global { interface Window { Telegram?: { WebApp?: any } } }

function App() {
  const tg = window.Telegram?.WebApp;
  const initData = tg?.initData ?? '';
  const demoId = '100001';
  const [user, setUser] = useState<{id:string;name:string}|null>(null);
  const [partnerName, setPartnerName] = useState('');
  const [coupleId, setCoupleId] = useState(localStorage.getItem('nam_couple_id'));
  const [inviteUrl, setInviteUrl] = useState('');
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selected, setSelected] = useState<Assignment|null>(null);
  const [reveal, setReveal] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const startParam = tg?.initDataUnsafe?.start_param ?? '';
  const headers = useMemo(() => ({ 'content-type':'application/json', ...(initData ? {'x-telegram-init-data':initData} : {'x-demo-user-id':demoId}) }), [initData]);

  useEffect(() => { tg?.ready?.(); tg?.expand?.(); auth(); }, []);

  async function auth() {
    const r = await fetch(`${API}/api/auth`, { method:'POST', headers });
    if (r.ok) setUser((await r.json()).user);
    if (startParam.startsWith('pair_')) await join(startParam.slice(5));
  }
  async function join(token:string) {
    const r = await fetch(`${API}/api/couples/join`, {method:'POST',headers,body:JSON.stringify({inviteToken:token})});
    if(r.ok){ const d=await r.json(); localStorage.setItem('nam_couple_id',d.coupleId); setCoupleId(d.coupleId); }
  }
  async function createCouple() {
    setLoading(true); setMessage('');
    const r=await fetch(`${API}/api/couples`,{method:'POST',headers,body:JSON.stringify({partnerName})});
    const d=await r.json();
    if(!r.ok){setMessage(d.error||'Не удалось создать пару');setLoading(false);return;}
    localStorage.setItem('nam_couple_id',d.coupleId); setCoupleId(d.coupleId); setInviteUrl(d.inviteUrl); setLoading(false);
  }
  async function loadWeek() {
    if(!coupleId)return;
    setLoading(true); setMessage('');
    const r=await fetch(`${API}/api/weeks/current?coupleId=${encodeURIComponent(coupleId)}`,{headers});
    const d=await r.json();
    if(r.ok){setAssignments(d.assignments);}
    else setMessage(d.error||'Не удалось загрузить неделю');
    setLoading(false);
  }
  async function complete(a:Assignment) {
    setLoading(true);
    const r=await fetch(`${API}/api/assignments/${a.id}/complete`,{method:'POST',headers});
    const d=await r.json();
    if(r.ok){setAssignments(xs=>xs.map(x=>x.id===a.id?{...x,status:'COMPLETED'}:x));setSelected(null); if(d.bothCompleted) await loadReveal();}
    else setMessage(d.error||'Ошибка');
    setLoading(false);
  }
  async function loadReveal(){
    const week=await fetch(`${API}/api/weeks/current?coupleId=${coupleId}`,{headers});
    const w=await week.json();
    if(!w.week?.id)return;
    const r=await fetch(`${API}/api/weeks/${w.week.id}/reveal`,{headers});
    if(r.ok)setReveal((await r.json()).assignments);
  }

  useEffect(()=>{if(coupleId) loadWeek();},[coupleId]);

  if(!coupleId) return <main className="app"><div className="logo">НАМ <span>♥</span></div><section className="hero"><p className="eyebrow">ИГРА ДЛЯ ДВОИХ</p><h1>У каждого из вас будет своя секретная миссия.</h1><p className="sub">Вы не знаете, что выпало партнёру. Выполняете свои задания — потом раскрываете их друг другу.</p><input placeholder="Имя партнёра" value={partnerName} onChange={e=>setPartnerName(e.target.value)}/><button disabled={!partnerName||loading} onClick={createCouple}>{loading?'Создаём…':'Создать нашу пару'}</button>{message&&<p className="error">{message}</p>}</section></main>;

  const easy=assignments.filter(a=>a.difficulty==='EASY'), medium=assignments.filter(a=>a.difficulty==='MEDIUM'), hard=assignments.filter(a=>a.difficulty==='HARD');
  return <main className="app"><div className="logo">НАМ <span>♥</span></div><section className="home"><p className="eyebrow">ВАША НЕДЕЛЯ</p><h1>{user?.name||'Вы'} ♥ партнёр</h1>
    <div className="stats"><div><b>{easy.filter(a=>a.status==='COMPLETED').length}/{easy.length}</b><span>Easy</span></div><div><b>{medium.filter(a=>a.status==='COMPLETED').length}/{medium.length}</b><span>Medium</span></div><div><b>{hard.length? '🔥':'?'}</b><span>Hard</span></div></div>
    <div className="missions">{assignments.map(a=><button key={a.id} className={`missionCard ${a.status==='COMPLETED'?'completed':''}`} onClick={()=>setSelected(a)}><span>{a.difficulty==='EASY'?'✨':a.difficulty==='MEDIUM'?'💫':'🔥'} {a.difficulty}</span><b>{a.status==='COMPLETED'?'Миссия выполнена':'Секретная миссия'}</b><small>{a.task.estimatedMinutes} мин · {a.task.budgetMax?`до ${a.task.budgetMax} ₽`:'бесплатно'}</small></button>)}</div>
    {selected&&<div className="task"><button className="close" onClick={()=>setSelected(null)}>×</button><div className="badge">{selected.difficulty} · {selected.task.category}</div><h2>{selected.task.title}</h2><p>{selected.task.description}</p>{selected.status!=='COMPLETED'?<button onClick={()=>complete(selected)} disabled={loading}>Я сделал ❤️</button>:<div className="done">✓ Миссия выполнена</div>}<div className="secret">🤫 Задание партнёра скрыто</div></div>}
    {inviteUrl&&<div className="invite"><b>Пригласи партнёра:</b><span>{inviteUrl}</span><button onClick={()=>navigator.clipboard?.writeText(inviteUrl)}>Скопировать ссылку</button></div>}
    {reveal.length>0&&<div className="reveal"><h2>🎁 Миссии раскрыты</h2>{reveal.map(a=><div className="revealCard" key={a.id}><small>{a.userName} · {a.difficulty}</small><b>{a.task.title}</b><p>{a.task.description}</p></div>)}</div>}
    {message&&<p className="error">{message}</p>}
  </section></main>
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
