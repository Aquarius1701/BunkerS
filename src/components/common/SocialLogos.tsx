import React from 'react';

/**
 * Haqiqiy rasmiy Telegram ilova logosi
 * 100% original brend vektori, 3D soya, shisha tovlanishi va sichqoncha tekkanda tovlanish effekti
 */
export function RealTelegramLogo({ className = "w-10 h-10" }: { className?: string }) {
  return (
    <div
      className={`${className} relative rounded-full flex items-center justify-center shrink-0 shadow-md select-none transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer overflow-hidden group tovlanish-container hover:shadow-[0_0_22px_#2AABEE,0_0_36px_rgba(42,171,238,0.55)]`}
      title="Telegram"
    >
      <svg
        viewBox="0 0 240 240"
        className="w-full h-full relative z-0"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Rasmiy Telegram moviy gradienti */}
          <linearGradient id="tgGradOfficial" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#2AABEE" />
            <stop offset="100%" stopColor="#229ED9" />
          </linearGradient>

          {/* Yuqori yaltiroq shisha tovlanishi */}
          <linearGradient id="tgGlassGloss" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>

          {/* Qog'oz samolyot ostidagi 3D yumshoq soya */}
          <filter id="tgPlaneShadow" x="-20%" y="-20%" width="150%" height="150%">
            <feDropShadow dx="0" dy="2.5" stdDeviation="2" floodColor="#0d3b66" floodOpacity="0.35" />
          </filter>
        </defs>

        {/* Telegram ko'k doirasi */}
        <circle cx="120" cy="120" r="120" fill="url(#tgGradOfficial)" />

        {/* Ustki yaltiroq nur tovlanishi */}
        <ellipse cx="120" cy="48" rx="88" ry="42" fill="url(#tgGlassGloss)" />

        {/* Haqiqiy rasmiy 3D qavatli qog'oz samolyot */}
        <g transform="translate(3, 1)" filter="url(#tgPlaneShadow)">
          {/* Pastki qatlam (Fold underneath) */}
          <path fill="#c8daea" d="m98 175c-3.8876 0-3.227-1.4679-4.5678-5.1695L82 132.2059 170 80" />
          {/* Quyqum qatlam (Bottom fin fold) */}
          <path fill="#a9c6d8" d="m98 175c3 0 4.3255-1.372 6-3l16-15.558-19.958-12.035" />
          {/* Asosiy samolyot korpusi (Top white wings) */}
          <path
            fill="#ffffff"
            d="m100.04 144.41 48.36 35.729c5.5185 3.0449 9.5014 1.4684 10.876-5.1235l19.685-92.763c2.0154-8.0802-3.0801-11.745-8.3601-9.3482l-115.59 44.571c-7.8901 3.1647-7.8441 7.5666-1.4382 9.528l29.663 9.2583 68.673-43.325c3.2419-1.9659 6.2173-.90899 3.7752 1.2584"
          />
        </g>
      </svg>

      {/* Sichqoncha tekkanda tovlanuvchi nur chizig'i (Sheen Sweep) */}
      <div className="tovlanish-sheen" />
    </div>
  );
}

/**
 * Haqiqiy rasmiy Instagram ilova logosi
 * Original squircle (22.5% radius), ko'p bosqichli botish (sunset) radial gradienti,
 * 3D kamera piktogrammasi va sichqoncha tekkanda tovlanish nuri
 */
export function RealInstagramLogo({ className = "w-10 h-10" }: { className?: string }) {
  return (
    <div
      className={`${className} relative rounded-[22.5%] flex items-center justify-center shrink-0 shadow-md select-none transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer overflow-hidden group tovlanish-container hover:shadow-[0_0_24px_#E1306C,0_0_38px_rgba(253,89,73,0.55)]`}
      title="Instagram"
    >
      <svg
        viewBox="0 0 240 240"
        className="w-full h-full relative z-0"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Rasmiy Instagram radial sunset gradienti (sariq-olovrang-pushti-binafsha-ko'k) */}
          <radialGradient id="igRadSunset" cx="18%" cy="102%" r="130%">
            <stop offset="0%" stopColor="#FFDC80" />
            <stop offset="10%" stopColor="#FCAF45" />
            <stop offset="35%" stopColor="#F77737" />
            <stop offset="55%" stopColor="#F56040" />
            <stop offset="68%" stopColor="#FD1D1D" />
            <stop offset="80%" stopColor="#E1306C" />
            <stop offset="90%" stopColor="#C13584" />
            <stop offset="96%" stopColor="#833AB4" />
            <stop offset="100%" stopColor="#405DE6" />
          </radialGradient>

          {/* O'ng yuqori qismdagi qo'shimcha moviy burchak gradienti */}
          <radialGradient id="igRadBlueCorner" cx="88%" cy="12%" r="80%">
            <stop offset="0%" stopColor="#405DE6" stopOpacity="0.85" />
            <stop offset="50%" stopColor="#5851DB" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#833AB4" stopOpacity="0" />
          </radialGradient>

          {/* Kamera ortidagi 3D soya */}
          <filter id="igCameraShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="1.8" floodColor="#3b0764" floodOpacity="0.3" />
          </filter>

          {/* Shisha yaltirash effekti */}
          <linearGradient id="igGlassGloss" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Squircle foni */}
        <rect width="240" height="240" rx="54" fill="url(#igRadSunset)" />
        <rect width="240" height="240" rx="54" fill="url(#igRadBlueCorner)" />

        {/* Shisha gloss ustki qatlam */}
        <path d="M 0 54 Q 0 0 54 0 L 186 0 Q 240 0 240 54 L 240 85 Q 120 120 0 85 Z" fill="url(#igGlassGloss)" opacity="0.5" />

        {/* Rasmiy kamera glifi 3D soya bilan */}
        <g filter="url(#igCameraShadow)">
          {/* Kamera tashqi konturi */}
          <rect
            x="52"
            y="52"
            width="136"
            height="136"
            rx="38"
            fill="none"
            stroke="#ffffff"
            strokeWidth="14"
          />
          {/* Markaziy linza */}
          <circle
            cx="120"
            cy="120"
            r="34"
            fill="none"
            stroke="#ffffff"
            strokeWidth="14"
          />
          {/* Flash nuqtasi */}
          <circle cx="158" cy="82" r="8.5" fill="#ffffff" />
        </g>
      </svg>

      {/* Sichqoncha tekkanda tovlanuvchi nur chizig'i (Sheen Sweep) */}
      <div className="tovlanish-sheen" />
    </div>
  );
}

/**
 * Haqiqiy rasmiy Telefon / Qo'ng'iroq logosi (WhatsApp / Call)
 * Jonli zumrad yashil gradientli doira, 3D telefon trubkasi va sichqoncha tekkanda tovlanish nuri
 */
export function RealPhoneLogo({ className = "w-10 h-10" }: { className?: string }) {
  return (
    <div
      className={`${className} relative rounded-full flex items-center justify-center shrink-0 shadow-md select-none transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer overflow-hidden group tovlanish-container hover:shadow-[0_0_24px_#25D366,0_0_38px_rgba(18,140,126,0.6)]`}
      title="Telefon qilish"
    >
      <svg
        viewBox="0 0 240 240"
        className="w-full h-full relative z-0"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Rasmiy jonli zumrad yashil gradient */}
          <linearGradient id="phoneGradOfficial" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#29E370" />
            <stop offset="45%" stopColor="#25D366" />
            <stop offset="80%" stopColor="#128C7E" />
            <stop offset="100%" stopColor="#075E54" />
          </linearGradient>

          {/* Yuqori yaltiroq shisha tovlanishi */}
          <linearGradient id="phoneGlassGloss" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.42" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>

          {/* Telefon trubkasi ostidagi soya */}
          <filter id="phoneHandsetShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2.5" stdDeviation="2" floodColor="#042f2e" floodOpacity="0.4" />
          </filter>
        </defs>

        {/* Yashil doira foni */}
        <circle cx="120" cy="120" r="120" fill="url(#phoneGradOfficial)" />

        {/* Yuqori shisha yaltiroq tovlanishi */}
        <ellipse cx="120" cy="48" rx="88" ry="42" fill="url(#phoneGlassGloss)" />

        {/* Rasmiy oq telefon trubkasi */}
        <path
          fill="#ffffff"
          filter="url(#phoneHandsetShadow)"
          d="M165.7 141.2c-2.4-.6-14-6.9-16.2-7.7-2.2-.8-3.8-1.2-5.4 1.2-1.6 2.4-6.2 7.7-7.6 9.3-1.4 1.6-2.8 1.8-5.2.6-2.4-1.2-10.1-3.7-19.2-11.8-7.1-6.3-11.9-14.1-13.3-16.5-1.4-2.4-.1-3.7 1.1-4.9 1.1-1.1 2.4-2.8 3.6-4.2 1.2-1.4 1.6-2.4 2.4-4 .8-1.6.4-3-.2-4.2s-5.4-13-7.4-17.8c-2-4.6-4-4-5.4-4.1-1.4-.1-3-.1-4.6-.1-1.6 0-4.2.6-6.4 3-2.2 2.4-8.4 8.2-8.4 20s8.6 23.2 9.8 24.8c1.2 1.6 16.9 25.8 41 36.2 5.7 2.5 10.2 4 13.7 5.1 5.8 1.8 11 1.6 15.2 1 4.6-.7 14-5.7 16-11.2 2-5.5 2-10.2 1.4-11.2-.6-1.1-2.2-1.7-4.6-2.9z"
        />
      </svg>

      {/* Sichqoncha tekkanda tovlanuvchi nur chizig'i (Sheen Sweep) */}
      <div className="tovlanish-sheen" />
    </div>
  );
}

/**
 * Haqiqiy rasmiy YouTube App logosi (iOS / Android ilova belgisi)
 * Oq squircle ilova foni va markazda 100% original YouTube qizil ekrani (#FF0000) + oq Play uchburchagi
 */
export function RealYouTubeLogo({ className = "w-10 h-10" }: { className?: string }) {
  return (
    <div
      className={`${className} relative rounded-[22.5%] flex items-center justify-center shrink-0 shadow-md select-none transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer overflow-hidden bg-white group tovlanish-container hover:shadow-[0_0_24px_#FF0000,0_0_38px_rgba(255,0,0,0.65)]`}
      title="YouTube"
    >
      <svg
        viewBox="0 0 240 240"
        className="w-full h-full relative z-0"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* YouTube App oq squircle foni */}
        <rect width="240" height="240" rx="54" fill="#FFFFFF" />

        {/* Rasmiy YouTube qizil ekrani (100% original nisbat va shakl) */}
        <path
          fill="#FF0000"
          d="M206.4 81.4c-2.1-7.8-8.2-13.9-16-16C176.3 61.6 120 61.6 120 61.6s-56.3 0-70.4 3.8c-7.8 2.1-13.9 8.2-16 16C29.8 95.5 29.8 120 29.8 120s0 24.5 3.8 38.6c2.1 7.8 8.2 13.9 16 16 14.1 3.8 70.4 3.8 70.4 3.8s56.3 0 70.4-3.8c7.8-2.1 13.9-8.2 16-16 3.8-14.1 3.8-38.6 3.8-38.6s0-24.5-3.8-38.6z"
        />

        {/* Markaziy oq YouTube Play uchburchagi */}
        <polygon
          fill="#FFFFFF"
          points="102,145 102,95 149,120"
        />
      </svg>

      {/* Sichqoncha tekkanda tovlanuvchi nur chizig'i (Sheen Sweep) */}
      <div className="tovlanish-sheen" />
    </div>
  );
}

/**
 * Haqiqiy rasmiy Facebook ilova logosi
 */
export function RealFacebookLogo({ className = "w-10 h-10" }: { className?: string }) {
  return (
    <div
      className={`${className} relative rounded-full flex items-center justify-center shrink-0 shadow-md select-none transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer overflow-hidden bg-[#1877F2] group tovlanish-container hover:shadow-[0_0_24px_#1877F2,0_0_36px_rgba(24,119,242,0.55)]`}
      title="Facebook"
    >
      <svg
        viewBox="0 0 240 240"
        className="w-full h-full relative z-0"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="120" cy="120" r="120" fill="#1877F2" />
        <path
          fill="#ffffff"
          d="M135.5 240v-92.7h31.1l4.7-36.1h-35.8V88.2c0-10.4 2.9-17.5 17.8-17.5l19-.01V38.4C169 37.9 157.6 37 144.3 37c-27.7 0-46.7 16.9-46.7 48v26.9H66.5v36.1h31.1V240h37.9z"
        />
      </svg>
      <div className="tovlanish-sheen" />
    </div>
  );
}
