import { createContext, useContext, useState, useCallback } from 'react';
import { translate } from '../i18n.js';

const LanguageContext = createContext(null);
const LANG_KEY = 'mjm.lang';

function initialLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'en' || saved === 'ms') return saved;
  } catch (e) {
    /* ignore */
  }
  return 'en';
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(initialLang);

  const setLang = useCallback((next) => {
    setLangState(next);
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch (e) {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(() => setLang(lang === 'en' ? 'ms' : 'en'), [lang, setLang]);

  // t(key, vars) — stable per language.
  const t = useCallback((key, vars) => translate(lang, key, vars), [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, toggle, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang() {
  return useContext(LanguageContext);
}

// Small EN/BM toggle pill. `dark` styles it for the dark scan/auth screens.
export function LangToggle({ dark = false }) {
  const { lang, toggle } = useLang();
  const label = lang === 'en' ? 'BM' : 'EN';
  return (
    <button
      onClick={toggle}
      title="Switch language / Tukar bahasa"
      className={
        'shrink-0 font-black text-[10px] uppercase tracking-widest rounded-full px-3 py-2 border cursor-pointer transition-colors ' +
        (dark
          ? 'bg-white/5 border-emerald-400/30 text-emerald-300 hover:bg-white/10'
          : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-emerald-700 hover:border-emerald-300')
      }
    >
      🌐 {label}
    </button>
  );
}
