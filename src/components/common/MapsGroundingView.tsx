import React from 'react';

export const MapsGroundingView: React.FC = () => {
  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-slate-900 via-sky-950 to-slate-900 p-6 sm:p-8 rounded-2xl border border-sky-500/30 shadow-2xl">
        <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
          Qurilish Bozorlari, Zavodlar & <span className="text-sky-400">Logistika Xaritasi</span>
        </h1>
      </div>

      <div className="rounded-2xl overflow-hidden border border-slate-700/80 bg-slate-900 h-[420px] w-full">
        <iframe
          title="Logistika Xaritasi"
          src="https://maps.google.com/maps?q=41.3111,69.2406&z=11&output=embed"
          className="w-full h-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
    </div>
  );
};
