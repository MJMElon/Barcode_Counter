import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { cacheGet, cacheSet } from '../lib/cache.js';
import { useOnline, useAutoSync } from '../hooks/useOnline.js';
import { useLang } from '../context/LanguageContext.jsx';

const CACHE_KEY = 'collection_board_today';

function todayStr() {
  // Local YYYY-MM-DD
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// "TV" board above the modules: who is coming today to collect seedlings.
// Reads shared_collection_bookings (the Collection Time Booking data), caches
// for offline use, and refreshes every ~1 minute while online.
//
// NOTE: location-based access control is not wired yet. When per-FC location
// access is added, pass a `locationFilter` (nursery_name) prop and the query /
// filter below will restrict rows to that location.
export default function CollectionBoard({ locationFilter = null }) {
  const { t } = useLang();
  const online = useOnline();
  const cached = cacheGet(CACHE_KEY);
  const [rows, setRows] = useState(cached?.value || null);
  const [updatedAt, setUpdatedAt] = useState(cached?.at || null);

  useAutoSync(async () => {
    try {
      let q = supabase
        .from('shared_collection_bookings')
        .select('id, booking_date, start_time, end_time, customer_name, collection_qty, nursery_name, plot_name, status, al_number')
        .eq('booking_date', todayStr())
        .neq('status', 'cancelled')
        .order('start_time', { ascending: true });
      if (locationFilter) q = q.eq('nursery_name', locationFilter);
      const { data, error } = await q;
      if (error) return;
      setRows(data || []);
      setUpdatedAt(Date.now());
      cacheSet(CACHE_KEY, data || []);
    } catch (e) {
      /* keep showing cached data */
    }
  }, 60000);

  const list = (rows || []).filter((b) => !locationFilter || b.nursery_name === locationFilter);
  const totalQty = list.reduce((s, b) => s + (b.collection_qty || 0), 0);

  const statusStyle = (s) =>
    s === 'completed'
      ? 'text-emerald-300 border-emerald-400/40'
      : s === 'pending'
      ? 'text-amber-300 border-amber-400/40'
      : 'text-sky-300 border-sky-400/40';

  return (
    <div className="rounded-2xl border border-emerald-400/20 bg-[#05140c] text-emerald-50 overflow-hidden mb-4 shadow-lg">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-emerald-400/15 bg-[#071a10]">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full ${online ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'} shrink-0`} />
          <span className="font-black uppercase tracking-widest text-[11px] sm:text-xs truncate">
            🌱 {t('board.title')}
          </span>
        </div>
        <span className="text-[10px] font-bold text-emerald-300/70 shrink-0">
          {list.length} · {totalQty} pcs
        </span>
      </div>

      <div className="max-h-[34vh] overflow-y-auto divide-y divide-emerald-400/10">
        {rows === null ? (
          <div className="px-4 py-5 text-center text-[11px] font-bold text-emerald-300/50 uppercase tracking-widest">
            {t('common.loading')}
          </div>
        ) : list.length === 0 ? (
          <div className="px-4 py-5 text-center text-[11px] font-bold text-emerald-300/50 uppercase tracking-widest">
            {t('board.empty')}
          </div>
        ) : (
          list.map((b) => (
            <div key={b.id} className="flex items-center gap-3 px-3.5 py-2.5">
              <div className="font-mono font-black text-sm sm:text-base text-emerald-300 w-12 shrink-0 tabular-nums">
                {(b.start_time || '—').slice(0, 5)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm truncate">{b.customer_name || b.al_number || '—'}</div>
                <div className="text-[11px] text-emerald-300/60 truncate">
                  {(b.nursery_name || '—') + (b.plot_name ? ' · ' + b.plot_name : '')}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-black text-sm text-emerald-200">{b.collection_qty || 0}</div>
                <span className={`inline-block text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${statusStyle(b.status)}`}>
                  {b.status || 'booked'}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="px-4 py-1.5 border-t border-emerald-400/15 text-[9px] font-bold text-emerald-300/40 flex justify-between">
        <span>{t('board.footer')}</span>
        <span>{online ? (updatedAt ? t('board.updated', { time: new Date(updatedAt).toLocaleTimeString() }) : '') : t('board.offline')}</span>
      </div>
    </div>
  );
}
