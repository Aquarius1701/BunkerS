import React, { useState, useEffect } from 'react';
import { 
  Globe, 
  Send, 
  CheckCircle2, 
  X, 
  MapPin, 
  Container
} from 'lucide-react';
import { MOCK_FAKE_GLOBAL_IDS } from '../../data/mockData';

interface GlobalPartner {
  id: string;
  name: string;
  country: string;
  countryCode?: string;
  flag?: string;
  category: string;
  materials?: string[];
  productType?: string;
  capacity?: string;
  annualVolume?: string;
  transitTime?: string;
  deliveryDays?: string;
  deliveryMethod?: string;
  route?: string;
  certified?: string;
  status?: 'active' | 'in_transit' | 'approved' | 'customs';
}

export const GlobalBunkerHub: React.FC = () => {
  const [partners, setPartners] = useState<GlobalPartner[]>(() => {
    try {
      const saved = localStorage.getItem('bunkerstroy_global_partners');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter((g: any) => g && g.id && !MOCK_FAKE_GLOBAL_IDS.includes(g.id));
        }
      }
    } catch {}
    return [];
  });

  useEffect(() => {
    const syncGlobal = () => {
      try {
        const saved = localStorage.getItem('bunkerstroy_global_partners');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            setPartners(parsed.filter((g: any) => g && g.id && !MOCK_FAKE_GLOBAL_IDS.includes(g.id)));
            return;
          }
        }
        setPartners([]);
      } catch {
        setPartners([]);
      }
    };
    window.addEventListener('storage', syncGlobal);
    const interval = setInterval(syncGlobal, 2000);
    return () => {
      window.removeEventListener('storage', syncGlobal);
      clearInterval(interval);
    };
  }, []);

  const [selectedPartner, setSelectedPartner] = useState<GlobalPartner | null>(null);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);

  // Order form state
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [requestedMaterial, setRequestedMaterial] = useState('');
  const [requestedVolume, setRequestedVolume] = useState('');
  const [destinationHub, setDestinationHub] = useState('Toshkent-Tovarniy (TY kodi: 722400)');
  const [orderSent, setOrderSent] = useState(false);

  const handleOrderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setOrderSent(true);
    setTimeout(() => {
      setOrderSent(false);
      setIsOrderModalOpen(false);
      setSelectedPartner(null);
      setCompanyName('');
      setContactName('');
      setPhone('');
      setRequestedMaterial('');
      setRequestedVolume('');
    }, 2200);
  };

  return (
    <div className="space-y-6 pb-12 animate-fadeIn text-[#F5F5F2]">
      {partners.length === 0 ? (
        <div className="liquid-glass-filter-card rounded-2xl p-10 sm:p-12 text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-[#071326]/90 border border-[#1E3A6D] flex items-center justify-center mx-auto text-[#FFB800]">
            <Globe className="w-8 h-8" />
          </div>
          <h3 className="text-base sm:text-lg font-bold text-[#F5F5F2]">
            Hozircha Global Bunker hamkorlari kiritilmagan (0 ta)
          </h3>
          <p className="text-xs text-sky-200 max-w-md mx-auto">
            Xalqaro ta’minotchilar va mahsulotlar Admin kabineti orqali qo‘shilgandan so‘ng shu yerda aks etadi.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {partners.map((partner) => {
            const materialsList = partner.materials && partner.materials.length > 0
              ? partner.materials
              : partner.productType
              ? partner.productType.split(',').map((s) => s.trim()).filter(Boolean)
              : [partner.category];
            const capacityText = partner.capacity || partner.annualVolume || 'Shartnoma asosida';
            const transitText = partner.transitTime || partner.deliveryDays || '3-7 kun';
            const transportText = partner.deliveryMethod || partner.route || 'Temir yo‘l / Avto';
            const badgeCode = partner.countryCode || partner.flag || '🌐';

            return (
              <div
                key={partner.id}
                className="liquid-glass-card rounded-2xl p-5 flex flex-col justify-between space-y-4 group text-white"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-11 h-11 rounded-xl bg-[#071326]/90 border border-[#1E3A6D] group-hover:border-[#FFB800] flex items-center justify-center text-[#FFB800] shrink-0 font-mono font-black text-sm">
                        {badgeCode}
                      </div>
                      <div>
                        <h3 className="font-bold text-sm sm:text-base text-white group-hover:text-[#FFB800] transition-colors">
                          {partner.name}
                        </h3>
                        <span className="text-xs text-sky-200 flex items-center gap-1 font-mono">
                          <MapPin className="w-3 h-3 text-[#FFB800]" />
                          {partner.country}
                        </span>
                      </div>
                    </div>

                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shrink-0">
                      Faol Ta'minot
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-[#071326]/80 border border-white/15 space-y-1">
                    <span className="text-[10px] uppercase font-mono text-sky-200 block">Asosiy Kategoriya:</span>
                    <span className="text-xs sm:text-sm font-bold text-white block">{partner.category}</span>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[10px] uppercase font-mono text-sky-200">Yetkazib Beriladigan Mahsulotlar:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {materialsList.map((m, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-1 rounded-md bg-[#0F2547]/90 border border-white/15 text-xs text-white font-semibold"
                        >
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-2 border-t border-white/15">
                    <div>
                      <span className="text-sky-200 block text-[10px]">Quvvat:</span>
                      <span className="text-white font-bold">{capacityText}</span>
                    </div>
                    <div>
                      <span className="text-sky-200 block text-[10px]">Tranzit Muddati:</span>
                      <span className="text-[#FFB800] font-bold">{transitText}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-sky-200 block text-[10px]">Transport:</span>
                      <span className="text-white">{transportText}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => {
                      setSelectedPartner(partner);
                      setRequestedMaterial(materialsList[0] || partner.category);
                      setIsOrderModalOpen(true);
                    }}
                    className="liquid-glass-btn-amber w-full py-2.5 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Container className="w-4 h-4" />
                    <span>Import Shartnoma So‘rovi</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Inquiry / Import Order Modal */}
      {isOrderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fadeIn">
          <div 
            className="w-full max-w-xl bg-[#0A1931] border-2 border-[#FFB800] rounded-xl shadow-2xl p-6 sm:p-7 space-y-5 relative max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setIsOrderModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg bg-[#071326] text-sky-200 hover:text-[#F5F5F2] border border-[#1E3A6D] cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-[#071326] border border-[#FFB800] text-[#FFB800]">
                <Globe className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-[#F5F5F2]">Global Bunker Import Buyurtmasi</h2>
                <p className="text-xs text-sky-200">
                  {selectedPartner ? `${selectedPartner.name} (${selectedPartner.country}) orqali` : 'Xalqaro to‘g‘ridan-to‘g‘ri ta’minot shartnomasi'}
                </p>
              </div>
            </div>

            {orderSent ? (
              <div className="p-8 text-center space-y-3 bg-[#151719] rounded-xl border border-emerald-500/50 animate-fadeIn">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
                <h3 className="text-base font-bold text-white">Import So‘rovi Muvaffaqiyatli Qabul Qilindi!</h3>
                <p className="text-xs text-[#B8B8B3] max-w-md mx-auto">
                  BunkerStroy xalqaro savdo departamenti tez orada siz bilan bog‘lanadi.
                </p>
              </div>
            ) : (
              <form onSubmit={handleOrderSubmit} className="space-y-4 text-xs">
                <div className="space-y-1">
                  <label className="text-[#F5F5F2] font-bold">Kompaniya yoki Buyurtmachi Nomi:</label>
                  <input
                    type="text"
                    required
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#151719] border border-[#51504A] rounded-lg text-[#F5F5F2] focus:outline-none focus:border-[#FFB800]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[#F5F5F2] font-bold">Mas'ul Shaxs:</label>
                    <input
                      type="text"
                      required
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-[#151719] border border-[#51504A] rounded-lg text-[#F5F5F2] focus:outline-none focus:border-[#FFB800]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[#F5F5F2] font-bold">Telefon Raqami:</label>
                    <input
                      type="text"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-[#151719] border border-[#51504A] rounded-lg text-[#F5F5F2] font-mono focus:outline-none focus:border-[#FFB800]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[#F5F5F2] font-bold">Xomashyo Turi / Markasi:</label>
                    <input
                      type="text"
                      required
                      value={requestedMaterial}
                      onChange={(e) => setRequestedMaterial(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-[#151719] border border-[#51504A] rounded-lg text-[#F5F5F2] focus:outline-none focus:border-[#FFB800]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[#F5F5F2] font-bold">Talab Qilingan Hajm:</label>
                    <input
                      type="text"
                      required
                      value={requestedVolume}
                      onChange={(e) => setRequestedVolume(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-[#151719] border border-[#51504A] rounded-lg text-[#F5F5F2] focus:outline-none focus:border-[#FFB800]"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[#F5F5F2] font-bold">Yetkazish va Bojxona Qabul Stansiyasi:</label>
                  <select
                    value={destinationHub}
                    onChange={(e) => setDestinationHub(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#151719] border border-[#51504A] rounded-lg text-[#F5F5F2] focus:outline-none focus:border-[#FFB800] cursor-pointer"
                  >
                    <option value="Toshkent-Tovarniy (TY kodi: 722400)">Toshkent-Tovarniy (TY kodi: 722400)</option>
                    <option value="Chuqursoy Bojxona Posti (TY kodi: 720000)">Chuqursoy Bojxona Posti (TY kodi: 720000)</option>
                    <option value="Sergeli Logistika Markazi (TY kodi: 723507)">Sergeli Logistika Markazi (TY kodi: 723507)</option>
                    <option value="Samarqand TY Stansiyasi">Samarqand TY Stansiyasi</option>
                    <option value="Navoiy EIZ Erkin Bojxona Hududi">Navoiy EIZ Erkin Bojxona Hududi</option>
                  </select>
                </div>

                <button
                  type="submit"
                  className="btn-industrial-yellow w-full py-3 rounded-lg font-bold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer shadow-md"
                >
                  <Send className="w-4 h-4 stroke-[2.5]" />
                  <span>Ariza va Shartnoma So‘rovini Tasdiqlash</span>
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
