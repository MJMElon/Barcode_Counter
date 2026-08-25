import PalmsBody from './PalmsBody.jsx';
import TopNav from '../../components/TopNav.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

// PALMS — Plot Activity Log Monitoring System, as a full page.
//
// The same screen the floating train opens in a window; this is the /palms
// route, kept so a bookmark or a link still lands somewhere. Everything that
// makes it work lives in PalmsBody — this is the portal frame around it.
export default function PalmsModule() {
  const { staffName } = useAuth();

  return (
    <div className="min-h-screen bg-slate-100 fade-enter">
      <div className="max-w-[1000px] mx-auto px-3 sm:px-6 py-4">
        <PalmsBody
          header={({ maySetUp, showSettings, toggleSettings }) => (
            /* Settings lives on the cog in the bar: it is a place you set up
               once and rarely return to. */
            <div className="-mx-3 sm:-mx-6 -mt-4 mb-4">
              <TopNav
                title="PALMS"
                subtitle="FC Portal"
                user={staffName}
                back="/dashboard"
                onSettings={maySetUp ? toggleSettings : undefined}
                settingsOn={showSettings}
              />
            </div>
          )}
        />
      </div>
    </div>
  );
}
