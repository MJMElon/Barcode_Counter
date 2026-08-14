import TopNav from '../../components/TopNav.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

// PALMS — Plot Activity Log Monitoring System. The app lives at its own
// GitHub Pages site and runs fully offline with on-device storage; we embed
// it unchanged so it opens inside the portal like any other module.
const PALMS_URL = 'https://mjmelon.github.io/NurseryPALMS/';

export default function PalmsModule() {
  const { staffName } = useAuth();

  return (
    <div className="h-screen bg-slate-100 fade-enter flex flex-col">
      <TopNav title="PALMS" subtitle="FC Portal" user={staffName} back="/dashboard" />
      <iframe src={PALMS_URL} title="PALMS — Plot Activity Log Monitoring System" className="flex-1 w-full border-0" />
    </div>
  );
}
