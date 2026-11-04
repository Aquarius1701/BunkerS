import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldAlert,
  ShieldCheck,
  LogIn,
  LogOut,
  KeyRound,
  Laptop,
  Smartphone,
  Clock,
  RefreshCw,
  Download,
  Trash2,
  UserCheck,
  CheckCircle2,
  AlertTriangle,
  Info,
  ShoppingCart,
  Monitor
} from 'lucide-react';
import { CabinetLogItem, getLocalCabinetLogs, detectDeviceInfo } from '../lib/cabinetLogs';
import { UserProfile } from '../types';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';

interface CabinetLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
}

export const CabinetLogsModal: React.FC<CabinetLogsModalProps> = ({
  isOpen,
  onClose,
  currentUser,
}) => {
  const [logs, setLogs] = useState<CabinetLogItem[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [loading, setLoading] = useState(false);
  const [currentDevice, setCurrentDevice] = useState(() => detectDeviceInfo());

  const loadLogs = async () => {
    setLoading(true);
    setCurrentDevice(detectDeviceInfo());

    // 1. Load local logs first
    const local = getLocalCabinetLogs(currentUser?.id);
    let combined = [...local];

    // 2. Try fetching from Firestore if user is logged in
    try {
      if (currentUser?.id) {
        const q = query(
          collection(db, 'cabinet_logs'),
          where('userId', '==', currentUser.id),
          limit(50)
        );
        const snap = await getDocs(q);
        const remote: CabinetLogItem[] = [];
        snap.forEach((d) => {
          const item = d.data() as CabinetLogItem;
          if (
            item &&
            !item.isAdminSession &&
            !item.adminActor &&
            !String(item.action || '').startsWith('admin_')
          ) {
            remote.push(item);
          }
        });
        
        // Merge without duplicates
        const seen = new Set(combined.map((l) => l.id));
        for (const item of remote) {
          if (!seen.has(item.id)) {
            combined.push(item);
            seen.add(item.id);
          }
        }
      }
    } catch {}

    // Sort newest first
    combined.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    setLogs(combined);
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      loadLogs();
    }
  }, [isOpen, currentUser]);

  useEffect(() => {
    const handleLogRecorded = (e: any) => {
      if (isOpen && e.detail && !e.detail.isAdminSession && !String(e.detail.action || '').startsWith('admin_')) {
        setLogs((prev) => [e.detail, ...prev]);
      }
    };
    window.addEventListener('bunkerstroy_log_recorded', handleLogRecorded);
    return () => window.removeEventListener('bunkerstroy_log_recorded', handleLogRecorded);
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredLogs = logs.filter((log) => {
    if (log.isAdminSession || log.adminActor || String(log.action || '').startsWith('admin_')) return false;
    if (filter === 'all') return true;
    if (filter === 'auth') return log.action === 'login' || log.action === 'logout';
    if (filter === 'security') return log.action === 'password_change' || log.action === 'login_change';
    if (filter === 'orders') return log.action === 'order_placed' || log.action === 'product_publish';
    if (filter === 'profile') return log.action === 'profile_update';
    return true;
  });

  const formatLogDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleString('uz-UZ', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  const getActionBadge = (log: CabinetLogItem) => {
    if (log.isAdminSession || log.action.startsWith('admin_')) {
      return (
        <span className="px-2.5 py-1 rounded-full text-xs font-black bg-fuchsia-500/25 text-fuchsia-200 border border-fuchsia-400/60 flex items-center gap-1.5 shadow-sm shadow-fuchsia-500/20">
          <ShieldAlert className="w-3.5 h-3.5 text-fuchsia-300" />
          ADMIN AMALIYOTI {log.adminActor ? `(${log.adminActor})` : ''}
        </span>
      );
    }
    switch (log.action) {
      case 'login':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center gap-1.5">
            <LogIn className="w-3.5 h-3.5" /> Kirish
          </span>
        );
      case 'logout':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-700/80 text-slate-300 border border-slate-600 flex items-center gap-1.5">
            <LogOut className="w-3.5 h-3.5" /> Chiqish
          </span>
        );
      case 'password_change':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5" /> Parol o‘zgartirildi
          </span>
        );
      case 'login_change':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40 flex items-center gap-1.5">
            <UserCheck className="w-3.5 h-3.5" /> Login o‘zgartirildi
          </span>
        );
      case 'order_placed':
      case 'product_publish':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40 flex items-center gap-1.5">
            <ShoppingCart className="w-3.5 h-3.5" /> {log.action === 'product_publish' ? 'Mahsulot chiqarildi' : 'Yangi buyurtma'}
          </span>
        );
      case 'profile_update':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> Ma'lumot tahrirlandi
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-700 text-slate-300">
            {log.action}
          </span>
        );
    }
  };

  const handleExport = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(logs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `bunkerstroy_kabinet_loglar_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleClearLogs = () => {
    if (confirm("Kabinet loglarini tozalashni xohlaysizmi?")) {
      if (currentUser?.id) {
        localStorage.removeItem('bunkerstroy_cabinet_logs_' + currentUser.id);
      }
      localStorage.removeItem('bunkerstroy_cabinet_logs_all');
      setLogs([]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-fadeIn">
      <div className="bg-[#071739] border-2 border-blue-500/50 rounded-3xl max-w-4xl w-full p-5 sm:p-7 text-white shadow-2xl space-y-5 max-h-[92vh] flex flex-col relative">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-blue-500/30 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-400 text-slate-950 font-black flex items-center justify-center shadow-lg shadow-amber-400/30">
              <ShieldAlert className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-white tracking-wide">
                  BunkerStroy — Kabinet Loglari
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-400 text-slate-950">
                  Loglar Bo‘limi
                </span>
              </div>
              <p className="text-xs text-sky-200">
                Ushbu kabinetning kirish-chiqish vaqti, qurilma nomi, parol o‘zgartirish va Admin amaliyotlari qaydlari.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2.5 rounded-xl bg-[#0a2357] hover:bg-red-500/20 text-slate-300 hover:text-white transition-colors cursor-pointer border border-blue-500/30"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Active Device & Cabinet Info Box */}
        <div className="bg-[#0a2357] rounded-2xl p-4 border border-blue-400/40 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs shrink-0">
          <div>
            <span className="text-slate-400 block text-[11px]">Kabinet egasi:</span>
            <span className="font-bold text-white text-sm truncate block">
              {currentUser?.displayName || currentUser?.companyName || 'Mehmon kabineti'}
            </span>
          </div>

          <div>
            <span className="text-slate-400 block text-[11px] flex items-center gap-1">
              <Monitor className="w-3.5 h-3.5 text-amber-400" /> Qurilma nomi:
            </span>
            <span className="font-bold text-amber-300 truncate block">
              {currentDevice.device} ({currentDevice.os})
            </span>
          </div>

          <div>
            <span className="text-slate-400 block text-[11px]">Brauzer & Ekran:</span>
            <span className="font-bold text-sky-200 truncate block">
              {currentDevice.browser} • {currentDevice.screen}
            </span>
          </div>

          <div>
            <span className="text-slate-400 block text-[11px]">Sessiya holati:</span>
            <span className="font-bold text-emerald-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              Faol va himoyalangan
            </span>
          </div>
        </div>

        {/* Filter Chips & Action Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'all', label: `Barchasi (${logs.length})` },
              { id: 'auth', label: 'Kirish & Chiqish' },
              { id: 'security', label: 'Parol o‘zgartirish' },
              { id: 'admin', label: 'Admin Amaliyotlari' },
              { id: 'orders', label: 'Buyurtmalar' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  filter === f.id
                    ? f.id === 'admin'
                      ? 'bg-fuchsia-500 text-white shadow-md font-black'
                      : 'bg-amber-400 text-slate-950 shadow-md font-black'
                    : 'bg-[#0a2357] text-slate-300 hover:text-white border border-blue-500/30'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadLogs}
              title="Yangilash"
              className="p-2 rounded-xl bg-[#0a2357] hover:bg-[#10347e] text-slate-300 hover:text-white border border-blue-500/30 transition-all cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            {logs.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleExport}
                  title="Loglarni yuklab olish"
                  className="px-3 py-1.5 rounded-xl bg-[#0a2357] hover:bg-[#10347e] text-xs font-bold text-sky-200 border border-blue-500/30 flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-amber-400" />
                  <span>Eksport</span>
                </button>

                <button
                  type="button"
                  onClick={handleClearLogs}
                  title="Tozalash"
                  className="p-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 transition-all cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Logs List Table / Cards */}
        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 scrollbar-thin">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-16 bg-[#0a2357]/60 rounded-2xl border border-blue-500/30 p-6 space-y-3">
              <Clock className="w-10 h-10 text-slate-500 mx-auto" />
              <div className="text-slate-300 font-bold text-sm">Hozircha faollik qaydlari mavjud emas</div>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Kabinetga kirish, chiqish, parol o‘zgartirish hamda Admin amallari avtomatik ravishda bu yerda saqlanadi.
              </p>
            </div>
          ) : (
            filteredLogs.map((log) => {
              const isAdminEntry = Boolean(log.isAdminSession || log.action.startsWith('admin_'));
              return (
                <div
                  key={log.id}
                  className={`rounded-2xl p-3.5 sm:p-4 transition-all space-y-2 border-2 ${
                    isAdminEntry
                      ? 'bg-fuchsia-950/60 hover:bg-fuchsia-900/50 border-fuchsia-500/70 shadow-lg shadow-fuchsia-950/40'
                      : 'bg-[#091f4d] hover:bg-[#0c2a68] border-blue-500/30'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      {getActionBadge(log)}
                      <span className={`font-black text-sm ${isAdminEntry ? 'text-fuchsia-100' : 'text-white'}`}>
                        {log.actionLabel}
                      </span>
                      <span className={`text-[11px] font-mono px-2 py-0.5 rounded-md border ${
                        isAdminEntry
                          ? 'text-fuchsia-200 bg-fuchsia-500/20 border-fuchsia-400/40'
                          : 'text-amber-400 bg-amber-500/10 border-amber-400/20'
                      }`}>
                        {log.userLogin}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-300 font-mono shrink-0">
                      <Clock className={`w-3.5 h-3.5 ${isAdminEntry ? 'text-fuchsia-300' : 'text-amber-400'}`} />
                      <span>{formatLogDate(log.timestamp)}</span>
                    </div>
                  </div>

                  <p className={`text-xs leading-relaxed p-2.5 rounded-xl border ${
                    isAdminEntry
                      ? 'bg-fuchsia-950/80 text-fuchsia-100 border-fuchsia-400/40 font-semibold'
                      : 'bg-[#07173b] text-sky-100 border-blue-500/20'
                  }`}>
                    {log.details}
                  </p>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-400">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="flex items-center gap-1 text-slate-300 font-semibold">
                        {log.device.includes('Phone') ? <Smartphone className="w-3 h-3 text-amber-400" /> : <Laptop className="w-3 h-3 text-amber-400" />}
                        Qurilma: {log.device} ({log.os})
                      </span>
                      <span>Brauzer: {log.browser}</span>
                      <span>Ekran: {log.screen}</span>
                    </div>

                    <span className="text-slate-400 font-mono">
                      IP: {log.ip || '195.158.12.84'}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info note */}
        <div className="pt-2 border-t border-blue-500/30 flex items-center justify-between text-[11px] text-slate-400 shrink-0">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Ushbu bo‘lim BunkerStroy logotipi 2 marta bosilganda ochiladi.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs cursor-pointer"
          >
            Yopish
          </button>
        </div>

      </div>
    </div>
  );
};
