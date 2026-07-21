import { useEffect, useState } from 'react';
import TopNav from './TopNav.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang } from '../context/LanguageContext.jsx';
import { supabase } from '../lib/supabase.js';

export default function UserSettings() {
  const { staffName } = useAuth();
  const { t } = useLang();

  const [users, setUsers] = useState([]);
  const [nurseries, setNurseries] = useState([]);
  const [saving, setSaving] = useState(null); // user id being saved
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);

  const flash = (msg) => {
    setToast(msg);
    clearTimeout(flash._t);
    flash._t = setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    async function load() {
      try {
        const [usersRes, nursRes] = await Promise.all([
          supabase
            .from('shared_profiles')
            .select('id, email, full_name, permissions, user_type')
            .neq('user_type', 'customer')
            .order('full_name'),
          supabase
            .from('shared_plots')
            .select('nursery_name')
            .order('nursery_name'),
        ]);
        if (usersRes.error) throw usersRes.error;
        if (nursRes.error) throw nursRes.error;
        // Distinct nursery names
        const seen = new Set();
        const ns = (nursRes.data || []).map(r => r.nursery_name).filter(n => {
          if (seen.has(n)) return false;
          seen.add(n);
          return true;
        });
        setUsers(usersRes.data || []);
        setNurseries(ns);
      } catch (e) {
        flash(e.message || 'Load failed');
      }
      setLoading(false);
    }
    load();
  }, []);

  function getNurseries(user) {
    const v = user.permissions?.plot_status_nurseries;
    return Array.isArray(v) ? v : null; // null = all allowed
  }

  function toggleNursery(userId, nursery, currentList) {
    setUsers(prev => prev.map(u => {
      if (u.id !== userId) return u;
      const prev_list = currentList === null ? nurseries : currentList;
      const next = prev_list.includes(nursery)
        ? prev_list.filter(n => n !== nursery)
        : [...prev_list, nursery];
      return { ...u, permissions: { ...(u.permissions || {}), plot_status_nurseries: next } };
    }));
  }

  function toggleAll(userId, currentList) {
    setUsers(prev => prev.map(u => {
      if (u.id !== userId) return u;
      const perms = { ...(u.permissions || {}) };
      if (currentList === null) {
        // Currently all-allowed → restrict to all (user can then uncheck)
        perms.plot_status_nurseries = nurseries.slice();
      } else {
        // Currently restricted → remove restriction (allow all)
        delete perms.plot_status_nurseries;
      }
      return { ...u, permissions: perms };
    }));
  }

  async function save(user) {
    setSaving(user.id);
    try {
      const { error } = await supabase
        .from('shared_profiles')
        .update({ permissions: user.permissions || {} })
        .eq('id', user.id);
      if (error) throw error;
      flash(`Saved for ${user.full_name || user.email}`);
    } catch (e) {
      flash(e.message || 'Save failed');
    }
    setSaving(null);
  }

  const displayName = (u) => u.full_name || u.email || '—';

  return (
    <div className="min-h-screen bg-slate-100">
      <TopNav title="Nursery Access" subtitle="FC Portal Settings" back="/dashboard" user={staffName} />

      {toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-slate-800 text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-lg">
          {toast}
        </div>
      )}

      <div className="max-w-[700px] mx-auto px-3 sm:px-6 py-5">
        <p className="text-[12px] text-slate-500 font-semibold mb-4 leading-relaxed">
          Set which nurseries each FC can see under <strong>Plot Status</strong>.
          Leave <em>All nurseries</em> checked to allow unrestricted access.
        </p>

        {loading ? (
          <div className="text-center py-16 text-slate-400 text-sm">Loading…</div>
        ) : nurseries.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-sm">No nurseries found in the database.</div>
        ) : (
          <div className="space-y-3">
            {users.map(u => {
              const allowed = getNurseries(u);
              const isBusy = saving === u.id;
              return (
                <div key={u.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div>
                      <div className="font-black text-slate-800 text-sm">{displayName(u)}</div>
                      {u.full_name && (
                        <div className="text-[11px] text-slate-400 font-semibold">{u.email}</div>
                      )}
                    </div>
                    <button
                      onClick={() => save(u)}
                      disabled={isBusy}
                      className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-lg shrink-0 cursor-pointer transition-colors"
                    >
                      {isBusy ? '…' : 'Save'}
                    </button>
                  </div>

                  {/* "All nurseries" toggle */}
                  <label className="flex items-center gap-2 cursor-pointer mb-2">
                    <input
                      type="checkbox"
                      checked={allowed === null}
                      onChange={() => toggleAll(u.id, allowed)}
                      className="w-4 h-4 accent-emerald-600"
                    />
                    <span className={`text-[13px] font-black uppercase tracking-wide ${allowed === null ? 'text-emerald-700' : 'text-slate-400'}`}>
                      All nurseries
                    </span>
                  </label>

                  {/* Per-nursery checkboxes — only shown when restricted */}
                  {allowed !== null && (
                    <div className="pl-6 flex flex-wrap gap-x-5 gap-y-1.5 mt-1">
                      {nurseries.map(n => (
                        <label key={n} className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={allowed.includes(n)}
                            onChange={() => toggleNursery(u.id, n, allowed)}
                            className="w-4 h-4 accent-emerald-600"
                          />
                          <span className="text-[13px] font-semibold text-slate-700">{n}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
