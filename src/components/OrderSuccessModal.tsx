import React from 'react';
import { CheckCircle2, Truck, Package, ArrowRight } from 'lucide-react';

interface OrderSuccessModalProps {
  isOpen: boolean;
  orderId: string | null;
  onClose: () => void;
  onViewOrders: () => void;
}

export const OrderSuccessModal: React.FC<OrderSuccessModalProps> = ({
  isOpen,
  orderId,
  onClose,
  onViewOrders,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#222528] border border-[#51504A] rounded-xl max-w-md w-full p-6 sm:p-8 space-y-6 shadow-2xl text-center relative overflow-hidden text-[#F5F5F2]">
        
        {/* Subtle industrial rivets */}
        <div className="absolute top-2.5 left-2.5 industrial-rivet" />
        <div className="absolute top-2.5 right-2.5 industrial-rivet" />
        <div className="absolute bottom-2.5 left-2.5 industrial-rivet" />
        <div className="absolute bottom-2.5 right-2.5 industrial-rivet" />

        <div className="w-16 h-16 bg-[#292C2F] border border-[#51504A] rounded-xl flex items-center justify-center mx-auto text-[#FFB800]">
          <CheckCircle2 className="w-9 h-9 stroke-[2]" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl sm:text-2xl font-bold text-[#F5F5F2]">Buyurtma Qabul Qilindi!</h2>
          <p className="text-xs text-[#B8B8B3]">
            Buyurtmangiz raqami: <span className="font-mono text-[#FFB800] font-bold">{orderId}</span>
          </p>
          <p className="text-xs text-[#B8B8B3] leading-relaxed">
            Qurilish mollari omborda tayyorlanmoqda va transport haydovchisiga biriktirildi. Tez orada siz bilan operator bog'lanadi.
          </p>
        </div>

        <div className="flex flex-col gap-2.5 pt-2">
          <button
            onClick={() => {
              onClose();
              onViewOrders();
            }}
            className="btn-industrial-yellow w-full py-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
          >
            <Truck className="w-4 h-4" />
            Buyurtmalarim & Yuk Trackingini Ko‘rish
          </button>

          <button
            onClick={onClose}
            className="btn-industrial-dark w-full py-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer"
          >
            Bunkerga Qaytish
          </button>
        </div>

      </div>
    </div>
  );
};
