import React from 'react';
import { Clock, CheckCircle2, Package, Boxes, Truck, ShieldCheck, XCircle, HelpCircle } from 'lucide-react';
import { getOrderStatusMeta, OrderStatus } from '../../lib/orderStatus';
import { useLanguage } from '../../lib/i18n';

export interface OrderStatusBadgeProps {
  status: OrderStatus | string;
  className?: string;
  showIcon?: boolean;
  showDot?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const ICON_COMPONENTS = {
  Clock,
  CheckCircle2,
  Package,
  Boxes,
  Truck,
  ShieldCheck,
  XCircle,
  HelpCircle,
};

export const OrderStatusBadge: React.FC<OrderStatusBadgeProps> = ({
  status,
  className = '',
  showIcon = true,
  showDot = false,
  size = 'md',
}) => {
  const { lang } = useLanguage();
  const meta = getOrderStatusMeta(status);

  const label =
    lang === 'ru'
      ? meta.labelRu
      : lang === 'uz_cyrl'
      ? meta.labelUzCyrl
      : meta.labelUz;

  const IconComp = (ICON_COMPONENTS as Record<string, React.ElementType>)[meta.iconName] || HelpCircle;

  const sizeClasses = {
    sm: 'text-[11px] px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5',
    lg: 'text-sm px-3.5 py-1.5 gap-2 font-bold',
  }[size];

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-3.5 h-3.5',
    lg: 'w-4 h-4',
  }[size];

  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold border ${meta.badgeClass} ${sizeClasses} ${className}`}
    >
      {showDot && (
        <span className={`w-1.5 h-1.5 rounded-full ${meta.dotColor} shrink-0`} />
      )}
      {showIcon && <IconComp className={`${iconSizes} shrink-0`} />}
      <span className="truncate">{label}</span>
    </span>
  );
};
