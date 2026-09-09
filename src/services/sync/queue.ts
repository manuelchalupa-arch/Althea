// Sync opcional: Local → Cola → Server → Confirm → Conflicto (last-write-wins por updatedAt)
// Stub localStorage queue; F4 con backend real hará POST /api/sync
export type QueueItem = { id:string; entity:string; entityId:string; op:'create'|'update'|'delete'; payload:any; createdAt:string; status:'pending'|'done'; updatedAt:string }

const KEY='syncQueue'
export function enqueue(item:Omit<QueueItem,'status'|'createdAt'|'updatedAt'>){
  const q:QueueItem[] = JSON.parse(localStorage.getItem(KEY)||'[]')
  q.push({ ...item, status:'pending', createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() })
  localStorage.setItem(KEY, JSON.stringify(q))
}
export function getPending():QueueItem[]{ return (JSON.parse(localStorage.getItem(KEY)||'[]') as QueueItem[]).filter(x=>x.status==='pending') }
export async function syncNow(endpoint?:string){
  const pending = getPending()
  if(pending.length===0) return { synced:0 }
  if(!endpoint){
    // sin backend: marca como done localmente (offline-first)
    const q:QueueItem[] = JSON.parse(localStorage.getItem(KEY)||'[]')
    q.forEach(x=> x.status='done')
    localStorage.setItem(KEY, JSON.stringify(q))
    return { synced: pending.length, mode:'local' }
  }
  // con backend
  const res = await fetch(`${endpoint}/sync`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ items: pending }) })
  if(!res.ok) throw new Error('sync failed')
  const j = await res.json()
  return j
}
