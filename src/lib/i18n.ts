import { useState, useEffect } from 'react';

export type AppLanguage = 'uz' | 'uz_cyrl' | 'ru';

const LANG_STORAGE_KEY = 'bunkerstroy_app_lang';
const LANG_SELECTED_KEY = 'bunkerstroy_lang_selected';

export function hasUserSelectedLanguage(): boolean {
  try {
    return localStorage.getItem(LANG_SELECTED_KEY) === '1';
  } catch {
    return false;
  }
}

export function markLanguageSelected(): void {
  try {
    localStorage.setItem(LANG_SELECTED_KEY, '1');
  } catch {}
}

export function getAppLanguage(): AppLanguage {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (saved === 'ru' || saved === 'uz' || saved === 'uz_cyrl') return saved;
  } catch {}
  return 'uz';
}

export function setAppLanguage(lang: AppLanguage): void {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
    localStorage.setItem(LANG_SELECTED_KEY, '1');
    window.dispatchEvent(new CustomEvent('bunkerstroy_lang_changed', { detail: lang }));
  } catch {}
}

export function translateUzToCyrl(raw: string): string {
  if (!raw || !raw.trim()) return raw;
  // Do not transliterate pure numbers, emails, URLs, or strings with no Latin letters
  if (!/[A-Za-z]/.test(raw)) return raw;
  if (/^(https?:\/\/|www\.|\S+@\S+\.\S+)$/i.test(raw.trim())) return raw;

  // Preserve technical/brand tokens while transliterating Uzbek words
  const preservedTokens: string[] = [];
  let text = raw.replace(
    /\b(BunkerStroy|B2B|CRM|SMS|ID|VIP|PRO|PDF|Excel|E-IMZO|AI|Cloud|Google|Firebase|uz|ru|com)\b/g,
    (match) => {
      const idx = preservedTokens.length;
      preservedTokens.push(match);
      return `__TK${idx}__`;
    }
  );

  // Normalize curly apostrophes to standard single quote for matching
  const norm = text.replace(/[‘’ʻʼ`´]/g, "'");

  // Multi-character combinations (order matters: O', G', Sh, Ch, Yo, Yu, Ya, Ye, Ts)
  let out = norm
    .replace(/O'/g, 'Ў')
    .replace(/o'/g, 'ў')
    .replace(/G'/g, 'Ғ')
    .replace(/g'/g, 'ғ')
    .replace(/SH/g, 'Ш')
    .replace(/Sh/g, 'Ш')
    .replace(/sh/g, 'ш')
    .replace(/CH/g, 'Ч')
    .replace(/Ch/g, 'Ч')
    .replace(/ch/g, 'ч')
    .replace(/YO/g, 'Ё')
    .replace(/Yo/g, 'Ё')
    .replace(/yo/g, 'ё')
    .replace(/YU/g, 'Ю')
    .replace(/Yu/g, 'Ю')
    .replace(/yu/g, 'ю')
    .replace(/YA/g, 'Я')
    .replace(/Ya/g, 'Я')
    .replace(/ya/g, 'я')
    .replace(/YE/g, 'Е')
    .replace(/Ye/g, 'Е')
    .replace(/ye/g, 'е')
    .replace(/TS/g, 'Ц')
    .replace(/Ts/g, 'Ц')
    .replace(/ts/g, 'ц');

  // Word-initial E/e -> Э/э, otherwise Е/е
  out = out.replace(/(^|[^A-Za-zА-Яа-яЁёЎўҚқҒғҲҳ'])([Ee])/g, (_, prefix, ch) => {
    return prefix + (ch === 'E' ? 'Э' : 'э');
  });

  // Remaining apostrophes inside words become hard sign ъ/Ъ
  out = out.replace(/([A-ZА-ЯЁЎҚҒҲ])'(?=[A-ZА-ЯЁЎҚҒҲ])/g, '$1Ъ');
  out = out.replace(/'/g, 'ъ');

  const charMap: Record<string, string> = {
    A: 'А', a: 'а',
    B: 'Б', b: 'б',
    D: 'Д', d: 'д',
    E: 'Е', e: 'е',
    F: 'Ф', f: 'ф',
    G: 'Г', g: 'г',
    H: 'Ҳ', h: 'ҳ',
    I: 'И', i: 'и',
    J: 'Ж', j: 'ж',
    K: 'К', k: 'к',
    L: 'Л', l: 'л',
    M: 'М', m: 'м',
    N: 'Н', n: 'н',
    O: 'О', o: 'о',
    P: 'П', p: 'п',
    Q: 'Қ', q: 'қ',
    R: 'Р', r: 'р',
    S: 'С', s: 'с',
    T: 'Т', t: 'т',
    U: 'У', u: 'у',
    V: 'В', v: 'в',
    X: 'Х', x: 'х',
    Y: 'Й', y: 'й',
    Z: 'З', z: 'з',
    C: 'Ц', c: 'ц',
    W: 'В', w: 'в',
  };

  out = out.replace(/[A-Za-z]/g, (ch) => charMap[ch] ?? ch);

  // Restore preserved tokens
  out = out.replace(/__ТК(\d+)__|__TK(\d+)__/g, (_, i1, i2) => {
    const idx = Number(i1 ?? i2);
    return preservedTokens[idx] ?? '';
  });

  return out;
}

export function useLanguage() {
  const [lang, setLangState] = useState<AppLanguage>(() => getAppLanguage());

  useEffect(() => {
    const handleLangChange = () => {
      setLangState(getAppLanguage());
    };
    window.addEventListener('bunkerstroy_lang_changed', handleLangChange);
    window.addEventListener('storage', handleLangChange);
    return () => {
      window.removeEventListener('bunkerstroy_lang_changed', handleLangChange);
      window.removeEventListener('storage', handleLangChange);
    };
  }, []);

  const setLang = (nextLang: AppLanguage) => {
    setAppLanguage(nextLang);
    setLangState(nextLang);
  };

  const t = (uz: string, ru: string, uzCyrl?: string) => {
    if (lang === 'ru') return ru;
    if (lang === 'uz_cyrl') return uzCyrl || translateUzToCyrl(uz);
    return uz;
  };

  return { lang, setLang, t };
}

function normalizeQuotes(str: string): string {
  return str.replace(/['‘’ʻʼ`]/g, "'");
}

// Comprehensive exact phrase dictionary (UZ -> RU)
const EXACT_DICTIONARY: Record<string, string> = {
  // Navbar & Footer
  "Mahsulotlar": "Товары",
  "Mahsulot": "Товар",
  "Zavod Mahsulotlari": "Заводские товары",
  "B2B Bunker": "B2B Бункер",
  "B2B Mahsulotlar": "B2B Товары",
  "Kabinetga Kirish": "Войти в кабинет",
  "Kabinetga Kirish / Ro'yxatdan o'tish": "Войти / Регистрация",
  "Kabinet Yaratish": "Создать кабинет",
  "Savat": "Корзина",
  "Ta'minotchi": "Поставщик",
  "Ta'minotchi Kabineti": "Кабинет поставщика",
  "Mijoz Kabineti": "Кабинет клиента",
  "Kabinet": "Кабинет",
  "Chiqish": "Выйти",
  "Kabinetdan chiqish": "Выйти из кабинета",
  "Ichki va tashqi qurilish mahsulotlari markazi B2B2C": "Центр внутренних и наружных стройматериалов B2B2C",
  "Viloyatlararo Qurilish kategoriyasidagi mahsulotlarni Va Ta'minotchilarni Birlashtiruvchi (B2B2C) Onlayn market Platform.": "Межрегиональная онлайн-платформа (B2B2C), объединяющая строительные товары и поставщиков.",
  "Tezkor Havolalar": "Быстрые ссылки",
  "Biz Haqimizda": "О нас",
  "Ijtimoiy tarmoqlar": "Социальные сети",
  "Aloqa uchun": "Для связи",

  // Search & Filter (Marketplace)
  "Mahsulotlarni qidirish...": "Поиск товаров...",
  "Qidiruv": "Поиск",
  "Bunker Qidiruv filtri": "Фильтр поиска Bunker",
  "So‘rovingiz bo‘yicha qurilish mollari topilmadi.": "По вашему запросу стройматериалы не найдены.",
  "Qidiruv so‘zini o‘zgartiring yoki filtrlarni qayta o‘rnating.": "Измените поисковый запрос или сбросьте фильтры.",
  "Filtrlarni tozalash": "Сбросить фильтры",
  "Barchasini tozalash": "Очистить всё",
  "Tozalash": "Очистить",
  "Faol filtrlar:": "Активные фильтры:",
  "Viloyat & Shahar": "Область и Город",
  "Ta'mir kategoriyasi": "Категория ремонта",
  "Xususiyatlar": "Характеристики",
  "Viloyatlar": "Области",
  "Viloyatlarni tozalash": "Очистить области",
  "Tuman va shaharlar": "Районы и города",
  "TUMANLAR RO'YXATI VILOYAT BELGILAGANDAN SO'NG CHIQADI.": "СПИСОК РАЙОНОВ ПОЯВИТСЯ ПОСЛЕ ВЫБОРА ОБЛАСТИ.",
  "Tuman yoki shahar nomini qidirish...": "Поиск района или города...",
  "Tumanlarni tozalash": "Очистить районы",
  "Hozircha kategoriyalar kiritilmagan": "Категории пока не добавлены",
  "kv Metr (Maydon / O'lcham m²)": "кв. метр (Площадь / Размер м²)",
  "Faol": "Активно",
  "Obyekt, xona yoki materialning qamrov maydonini kvadrat metrda (kv.m) belgilang:": "Укажите площадь объекта, помещения или материала в квадратных метрах (кв.м):",
  "Min kv.m (m²):": "Мин кв.м (м²):",
  "Max kv.m (m²):": "Макс кв.м (м²):",
  "Cheksiz": "Без лимита",
  "Rang bo'yicha saralash": "Сортировка по цвету",
  "Ranglarni tozalash": "Очистить цвета",
  "Material yoki mahsulot rangini tanlang (bir nechta rangni tanlash mumkin):": "Выберите цвет материала или товара (можно выбрать несколько):",
  "Ishlab chiqarilgan davlat": "Страна производства",
  "Ishlab chiqarilgan davlat:": "Страна производства:",
  "Ishlab chiqarilgan davlat nomini yozing...": "Введите страну производства...",
  "Hozircha ro‘yxatda davlatlar yo‘q": "В списке пока нет стран",
  "+ Tanlash": "+ Выбрать",
  "Tanlash": "Выбрать",

  // Product Cards & Detail View
  "Vaqtincha tugagan": "Временно нет в наличии",
  "Savatga": "В корзину",
  "Qo‘shildi": "Добавлено",
  "Savatga qo‘shish": "Добавить в корзину",
  "✓ Savatga qo‘shildi": "✓ Добавлено в корзину",
  "Ta'minotchi:": "Поставщик:",
  "Ishlab chiqaruvchi ta'minotchi:": "Поставщик-производитель:",
  "Yetkazib beruvchi manzili:": "Адрес поставщика:",
  "Jami:": "Итого:",
  "Mavjud Variantlar:": "Доступные варианты:",
  "Minimal buyurtma:": "Минимальный заказ:",
  "Rangni tanlang:": "Выберите цвет:",
  "Mahsulot haqida Video tavsilot": "Видеообзор товара",
  "Videoni ko‘rish": "Смотреть видео",
  "Videoni yopish": "Закрыть видео",
  "Mahsulot haqida ma'lumot": "Информация о товаре",
  "Mahsulot tavsifi": "Описание товара",
  "Texnik xususiyatlar": "Технические характеристики",
  "O‘lchov birligi": "Единица измерения",
  "Ombor holati": "Состояние склада",
  "Yetkazib berish": "Доставка",
  "Mavjud": "Доступно",
  "Hudud": "Регион",
  "Barchasi": "Все",
  "Ichki ta'mir": "Внутренний ремонт",
  "Tashqi ta'mir": "Наружный ремонт",
  "Sement": "Цемент",
  "G‘isht": "Кирпич",
  "Asbob-uskunalar": "Инструменты",
  "Boshqa Mahsulotlar": "Другие товары",
  "Mahsulot tasviri": "Изображение товара",
  "Katta ekranda video namoyishi": "Просмотр видео на большом экране",

  // Regions
  "Toshkent shahri": "г. Ташкент",
  "Toshkent viloyati": "Ташкентская область",
  "Samarqand": "Самарканд",
  "Buxoro": "Бухара",
  "Andijon": "Андижан",
  "Farg‘ona": "Фергана",
  "Namangan": "Наманган",
  "Qashqadaryo": "Кашкадарья",
  "Surxondaryo": "Сурхандарья",
  "Navoiy": "Навои",
  "Jizzax": "Джизак",
  "Sirdaryo": "Сырдарья",
  "Xorazm": "Хорезм",
  "Qoraqalpog‘iston Res.": "Респ. Каракалпакстан",
  "O‘zbekiston": "Узбекистан",

  // Colors
  "Oq": "Белый",
  "Kulrang": "Серый",
  "Qora": "Черный",
  "Jigarrang": "Коричневый",
  "Qizil / G‘isht": "Красный / Кирпичный",
  "Bej / Qum": "Бежевый / Песочный",
  "Sariq": "Желтый",
  "Ko‘k / Moviy": "Синий / Голубой",
  "Yashil": "Зеленый",
  "Metall / Kumush": "Металл / Серебристый",
  "To‘q sariq / Apelsin": "Оранжевый",
  "Binafsha / Siyohrang": "Фиолетовый",
  "Pushti": "Розовый",
  "Feruza / Turkuaz": "Бирюзовый",
  "Oltin / Bronza": "Золотой / Бронза",

  // Units
  "dona": "шт.",
  "metr": "метр",
  "kg": "кг",
  "Kv": "кв.м",
  "tonna": "тонна",

  // CartModal & CheckoutModal
  "Bunkerdagi Materiallar": "Материалы в Бункере",
  "Bunkerdagi Materiallar bo'sh": "В Бункере пока нет материалов",
  "Hozirda tanlangan materiallar yo'q. Bunker platformasidan kerakli qurilish mahsulotlarini tanlashingiz mumkin.": "Сейчас нет выбранных материалов. Вы можете выбрать нужные стройматериалы на платформе Bunker.",
  "Mahsulotlarga qaytish": "Вернуться к товарам",
  "Savatni tozalash": "Очистить корзину",
  "Bunker savatingiz bo‘sh": "Ваша корзина пуста",
  "Qurilish materiallarini tanlash uchun katalogga o‘ting.": "Перейдите в каталог для выбора строительных материалов.",
  "Katalogga o‘tish": "Перейти в каталог",
  "Tanlangan Qurilish Mahsulotlari jadvaliga qaytish": "Вернуться к таблице выбранных стройматериалов",
  "Tanlangan Qurilish Mahsulotlari": "Выбранные стройматериалы",
  "Ta'minotchi Manzili": "Адрес поставщика",
  "Ta'minotchi Manzili:": "Адрес поставщика:",
  "Rasmiy Qurilish Ta'minotchisi": "Официальный поставщик стройматериалов",
  "Rasmiy Ta'minotchi": "Официальный поставщик",
  "Yetkazib berish:": "Доставка:",
  "✓ Mavjud": "✓ Доступно",
  "✕ Mavjud emas": "✕ Недоступно",
  "Buyurtma Miqdori": "Количество заказа",
  "Buyurtma Miqdori:": "Количество заказа:",
  "Ranglar:": "Цвета:",
  "O'lchov:": "Размер:",
  "Og'irlik:": "Вес:",
  "Uzunlik:": "Длина:",
  "Mahsulot Izohi va Tavsifi:": "Описание и примечание о товаре:",
  "Savatdagi Qolgan Mahsulotlar": "Остальные товары в корзине",
  "Ma'lumotlarini ko'rish uchun tanlang": "Выберите для просмотра деталей",
  "Savatda boshqa mahsulot yo'q. Faqat ushbu tanlangan mahsulot mavjud.": "В корзине нет других товаров. Доступен только этот выбранный товар.",
  "Jadval ko'rinishiga qaytish": "Вернуться к таблице",
  "Ko'rish": "Смотреть",
  "(Batafsil →)": "(Подробнее →)",
  "Umumiy Narx:": "Общая стоимость:",
  "To'lanadigan Jami Summa:": "Итого к оплате:",
  "Buyurtma berish": "Оформить заказ",
  "Miqdor": "Количество",
  "Birlik Narxi": "Цена за ед.",
  "Jami Summa:": "Общая сумма:",
  "Jami Summa": "Общая сумма",
  "Buyurtmani Rasmiylashtirish": "Оформить заказ",
  "1-Bosqich: Viloyat va Tumanni tanlang": "Шаг 1: Выберите область и район",
  "2-Bosqich: Manzilni tasdiqlash": "Шаг 2: Подтвердите адрес",
  "3-Bosqich: Qabul qiluvchi ma'lumotlari": "Шаг 3: Данные получателя",
  "4-Bosqich: To‘lov va Tasdiqlash": "Шаг 4: Оплата и подтверждение",
  "Xaritadan belgilash (Google Maps)": "Указать на карте (Google Maps)",
  "GPS Joylashuvim": "Моя GPS локация",
  "Xaritani yopish": "Закрыть карту",
  "Joylashuvni Tasdiqlash": "Подтвердить локацию",
  "Orqaga": "Назад",
  "Keyingi bosqich": "Следующий шаг",
  "To‘lovni tasdiqlash": "Подтвердить оплату",
  "ID Karta Raqami:": "Номер ID-карты:",
  "Tug‘ilgan Sana:": "Дата рождения:",

  // Auth Modal
  "Tizimga Kirish": "Вход в систему",
  "Ro‘yxatdan O‘tish": "Регистрация",
  "Login:": "Логин:",
  "Parol:": "Пароль:",
  "Kirish": "Войти",
  "Yopish": "Закрыть",
  "Bekor qilish": "Отмена",
  "Saqlash": "Сохранить",
  "O‘chirish": "Удалить",

  // User Cabinet (OrdersView)
  "Bunker": "Бункер",
  "Global Bunker": "Глобальный Бункер",
  "Buyurtmalarim": "Мои заказы",
  "Sozlamalar": "Настройки",
  "Kabinet sozlamalari": "Настройки кабинета",
  "Shaxsiy ma'lumotlar": "Личные данные",
  "Login va parolni o‘zgartirish": "Изменение логина и пароля",
  "Mahsulot uchun chek": "Чек на товар",
  "Buyurtmalar topilmadi": "Заказы не найдены",
  "Bunkerga O‘tish": "Перейти в Бункер",
  "Barcha buyurtmalar": "Все заказы",
  "Jarayonda": "В процессе",
  "Tasdiqlangan": "Подтвержденные",
  "Yo‘lda": "В пути",
  "Yetkazilgan": "Доставленные",
  "1. Onlayn mahsulot kutmoqda": "1. Ожидает подтверждения",
  "2. Mahsulot yuklash jarayonida": "2. В процессе погрузки",
  "3. Yetkazilmoqda": "3. Доставляется",
  "4. Yetkazildi": "4. Доставлено",
  "Mahsulot yuklash jarayonida": "В процессе погрузки",
  "Yetkazilmoqda": "Доставляется",
  "Yetkazildi": "Доставлено",
  "Buyurtma berildi": "Заказ оформлен",
  "Yuklash jarayonida": "В процессе погрузки",
  "Manzil:": "Адрес:",
  "Jami To'lov:": "Итого к оплате:",

  // Supplier Cabinet (B2B & B2C) Sidebar, Header & Tabs
  "Bunker Adminga qaytish": "Вернуться в Bunker Admin",
  "B2B Kabineti": "B2B Кабинет",
  "B2C Kabineti": "B2C Кабинет",
  "B2B Bo‘limlar": "B2B Разделы",
  "B2C Bo‘limlar": "B2C Разделы",
  "B2B Bo‘limlari": "B2B Разделы",
  "B2C Bo‘limlari": "B2C Разделы",
  "Bo‘limlar menyusi": "Меню разделов",
  "Qarz daftari": "Долговая книга",
  "Qarz daftari Chiqish": "Выйти из Долговой книги",
  "CRM": "CRM",
  "CRM Chiqish": "Выйти из CRM",
  "Hisobot, monitoring": "Отчеты, мониторинг",
  "Monitoring hisobot": "Мониторинг и отчеты",
  "B2B Mijozlar": "B2B Клиенты",
  "Onlayn Mijozlar": "Онлайн клиенты",
  "1. Hisobot, monitoring": "1. Отчеты и мониторинг",
  "2. Mening Mahsulotlarim": "2. Мои товары",
  "3. B2B Mijozlar": "3. B2B Клиенты",
  "3. Onlayn Mijozlar": "3. Онлайн клиенты",
  "4. B2B Bunker (Zavodlar)": "4. B2B Бункер (Заводы)",
  "5. B2B Buyurtmalarim": "5. Мои B2B заказы",
  "6. Sozlamalar": "6. Настройки",

  // Products Tab in SupplierCabinet
  "Korxona Mahsulotlari Katalogi": "Каталог товаров предприятия",
  "Yangi Mahsulot Qo‘shish (Onlayn Bunker)": "Добавить новый товар (Онлайн Бункер)",
  "Yangi Mahsulot Qo‘shish (Онлайн Bunker)": "Добавить новый товар (Онлайн Бункер)",
  "Yangi Mahsulot Qo‘shish (Oflayn)": "Добавить новый товар (Офлайн)",
  "Yangi Mahsulot Qo‘shish (Офлайн)": "Добавить новый товар (Офлайн)",
  "1. Onlayn Bunker": "1. Онлайн Бункер",
  "2. Oflayn mahsulotlar": "2. Офлайн товары",
  "Oflayn mahsulotlar": "Офлайн товары",
  "Mahsulot nomi": "Название товара",
  "Omborda mavjudligi": "Наличие на складе",
  "Xususiyatlari": "Характеристики",
  "Bunker narxi": "Цена Bunker",
  "CRM narxi": "Цена CRM",
  "Tahrirlash": "Изменить",
  "Hozircha korxona mahsulotlari kiritilmagan.": "Товары предприятия пока не добавлены.",
  "Hozircha oflayn mahsulotlar kiritilmagan.": "Офлайн товары пока не добавлены.",
  "Yangi mahsulot qo‘shish": "Добавить новый товар",

  // CRM Tab in SupplierCabinet
  "CRM — Ko‘p Savatli Savdo Tizimi": "CRM — Многокорзинная система продаж",
  "Mahsulot qidiruvi...": "Поиск товара...",
  "Mahsulot Nomi / Ombor": "Название товара / Склад",
  "Narxi": "Цена",
  "Narxi:": "Цена:",
  "Hozircha mahsulotlar kiritilmagan.": "Товары пока не добавлены.",
  "Qidiruv bo‘yicha mahsulot topilmadi.": "По запросу товары не найдены.",
  "Yana savat qo‘shish": "Добавить корзину",
  "Savatdagi mahsulotlar:": "Товары в корзине:",
  "Chegirma (%):": "Скидка (%):",
  "Yakuniy To‘lov:": "Итоговая оплата:",
  "Naqd / Karta Sotildi": "Продано (Нал / Карта)",
  "Qarzga yozish": "Записать в долг",
  "Tugagan": "Нет в наличии",
  "Yuklash": "Загрузить",
  "+ Yuklash": "+ Загрузить",
  "Onlayn": "Онлайн",
  "Oflayn": "Офлайн",

  // Debt Book Password Modal & Debt Book
  "Qarz Daftariga Kirish": "Вход в Долговую книгу",
  "Xavfsizlik uchun kabinet parolini kiriting": "В целях безопасности введите пароль кабинета",
  "Kabinet Paroli:": "Пароль кабинета:",
  "Kabinet parolini kiriting...": "Введите пароль кабинета...",
  "Tasdiqlash va Kirish": "Подтвердить и войти",
  "Tasdiqlash": "Подтвердить",
  "Qarz Daftari": "Долговая книга",
  "Qarzdor Ismi va Familiyasi:": "Имя и фамилия должника:",
  "Qarzdor telefon raqami:": "Номер телефона должника:",
  "To‘lash muddati (Sana):": "Срок оплаты (Дата):",
  "Qarzni saqlash": "Сохранить долг",
  "To‘landi": "Оплачено",
  "Qisman to‘lov": "Частичная оплата",
  "Kutilmoqda": "Ожидается",

  // Monitoring & Reports
  "Hisobot va Monitoring Tizimi": "Система отчетов и мониторинга",
  "PDF yuklab olish": "Скачать PDF",
  "Hisobot davri:": "Период отчета:",
  "Kunlik": "Дневной",
  "Haftalik": "Недельный",
  "Oylik": "Месячный",
  "Oyni belgilang (12 oy ro‘yxati):": "Выберите месяц (список 12 месяцев):",
  "Barcha oylar": "Все месяцы",
  "Yanvar": "Январь",
  "Fevral": "Февраль",
  "Mart": "Март",
  "Aprel": "Апрель",
  "May": "Май",
  "Iyun": "Июнь",
  "Iyul": "Июль",
  "Avgust": "Август",
  "Sentabr": "Сентябрь",
  "Oktabr": "Октябрь",
  "Noyabr": "Ноябрь",
  "Dekabr": "Декабрь",
  "1. Umumiy monitoring": "1. Общий мониторинг",
  "2. Onlayn savdo monitoringi": "2. Мониторинг онлайн-продаж",
  "3. CRM monitoringi": "3. Мониторинг CRM",
  "4. Kirim-chiqim": "4. Приход-расход",
  "4. Kutilayotgan qarzlar": "4. Ожидаемые долги",
  "5. Kutilayotgan qarzlar": "5. Ожидаемые долги",
  "Ombor holati:": "Состояние склада:",
  "1. Jami Umumiy Savdo:": "1. Общие продажи:",
  "2. Onlayn Bunker Savdosi:": "2. Онлайн-продажи Bunker:",
  "3. CRM Savdo (Naqd / To‘langan):": "3. Продажи CRM (Нал / Оплачено):",
  "4. Korxona Jami Daromadi:": "4. Общий доход предприятия:",
  "5. Kutilayotgan Qarzlar (CRM):": "5. Ожидаемые долги (CRM):",
  "1. Umumiy Monitoring Jadvali": "1. Таблица общего мониторинга",
  "2. Onlayn Savdo Monitoringi Jadvali": "2. Таблица мониторинга онлайн-продаж",
  "3. CRM Monitoringi Jadvali (CRM savdo)": "3. Таблица мониторинга CRM",
  "Sana": "Дата",
  "Tizim / Kanal": "Система / Канал",
  "Mahsulot Nomi": "Название товара",
  "Bunker Ulushi": "Доля Bunker",
  "Korxona Tushumi": "Выручка компании",
  "Xaridor / Mijoz": "Покупатель / Клиент",
  "Holat": "Статус",
  "Tanlangan monitoring bo‘limida hozircha savdo qayd etilmagan.": "В выбранном разделе мониторинга продажи пока не зафиксированы.",
  "CRM savdo": "Продажа CRM",
  "Onlayn Bunker": "Онлайн Бункер",

  // Customers & B2B Requests Section
  "B2B Mijozlar va Hamkor So‘rovlari": "B2B Клиенты и запросы партнеров",
  "B2B Bunker onlayn mijozlari hamda B2C hamkor kabinetlardan kelib tushgan ulgurji so‘rovlar": "Оптовые запросы от онлайн-клиентов B2B Bunker и партнерских B2C кабинетов",
  "Onlayn Mijozlar va Buyurtma So‘rovlari": "Онлайн клиенты и запросы заказов",
  "Bunker platformasidan kelib tushgan onlayn buyurtmalar va mijozlar ro‘yxati": "Список онлайн-заказов и клиентов с платформы Bunker",
  "1. Mijozlar so‘rovi": "1. Запросы клиентов",
  "2. B2B mijoz so‘rovlari": "2. Запросы B2B клиентов",
  "B2B Bunker foydalanuvchilaridan kelgan so‘rovlar": "Запросы от пользователей B2B Bunker",
  "B2C hamkor kabinetlardan kelgan ulgurji so‘rovlar": "Оптовые запросы от партнерских B2C кабинетов",
  "Hozircha platforma foydalanuvchilaridan so‘rovlar kelib tushmagan.": "От пользователей платформы пока не поступало запросов.",
  "Platforma foydalanuvchilari mahsulotlaringizga buyurtma berganda shu yerda aks etadi.": "Когда пользователи платформы закажут ваши товары, они отобразятся здесь.",
  "Hozircha B2C hamkor kabinetlardan ulgurji so‘rovlar kelib tushmagan.": "От партнерских B2C кабинетов пока не поступало оптовых запросов.",
  "Mijoz Ism-Familiyasi": "Ф.И.О. клиента",
  "Telefon Raqami": "Номер телефона",
  "Yetkazish Manzili": "Адрес доставки",
  "Olingan Mahsulotlar": "Полученные товары",
  "Buyurtmalar": "Заказы",
  "Jami Xarid Summasi": "Общая сумма покупок",
  "Oxirgi Xarid": "Последняя покупка",
  "Holat va Boshqaruv": "Статус и управление",
  "Ro‘yxatni ko‘rish": "Посмотреть список",
  "Olingan Mahsulotlar Ro‘yxati": "Список полученных товаров",
  "Ro‘yxatni PDF chiqarib olish": "Скачать список в PDF",
  "Jami xarid summasi:": "Общая сумма покупок:",

  // Settings & Theme & Language
  "Kabinet Sozlamalari": "Настройки кабинета",
  "Kunduzgi rejim": "Дневной режим",
  "Tungi rejim": "Ночной режим",
  "Kabinet Logini:": "Логин кабинета:",
  "Yangi Kirish Paroli (o‘zgartirish uchun):": "Новый пароль для входа (для изменения):",
  "Yangi Parolni Qayta Kiriting:": "Повторите новый пароль:",
  "Qo‘shimcha telefon raqam kiritish:": "Добавить дополнительный номер телефона:",
  "Qo‘shimcha raqamni saqlash": "Сохранить доп. номер",
  "Sozlamalarni Saqlash": "Сохранить настройки",
  "Til / Язык:": "Язык / Til:",
  "Platforma tili:": "Язык платформы:",

  // Add/Edit Product Modal (All Steps)
  "Yangi Mahsulot Qo‘shish": "Добавить новый товар",
  "Mahsulotni Tahrirlash": "Редактировать товар",
  "Mahsulot Nomi:": "Название товара:",
  "Mahsulot Turi:": "Тип товара:",
  "Tavsiya ro‘yxati": "Рекомендуемый список",
  "Onlayn bozorga chiqadgan narx:": "Цена для онлайн-рынка:",
  "CRM Narxi:": "Цена CRM:",
  "Asl narxi (Keltirilgan / sotib olingan narxi — so‘m):": "Себестоимость (закупочная цена — сум):",
  "Sotib olingan / keltirilgan narxi": "Закупочная цена",
  "Minimal buyurtma miqdori:": "Мин. количество заказа:",
  "Ombordagi miqdori:": "Количество на складе:",
  "Cheklanmagan": "Неограниченно",
  "✓ Cheklanmagan": "✓ Неограниченно",
  "Cheklanmagan miqdor": "Неограниченное количество",
  "Ombordagi mavjud miqdor": "Доступное количество на складе",
  "Omborda mavjud miqdor": "Доступное количество на складе",
  "Mahsulot Suratlari:": "Фотографии товара:",
  "Majburiy": "Обязательно",
  "Surat yuklash": "Загрузить фото",
  "Asosiy": "Основное",
  "Mahsulotning video tavsifi (YouTube video havolasi):": "Видеообзор товара (ссылка YouTube):",
  "Havolani o‘chirish": "Удалить ссылку",
  "Mavjudligi (O‘lchov birligi va Rang tanlash):": "Наличие (Единица измерения и выбор цвета):",
  "Ochish ▼": "Открыть ▼",
  "Yig‘ish ▲": "Свернуть ▲",
  "O‘lchov Birligi (pastidan raqam kiriting):": "Единица измерения (введите число ниже):",
  "Onlaynga chiqarish": "Опубликовать онлайн",
  "Onlayn savdoga chiqarish": "Опубликовать в онлайн-продажу",
  "Oflayn uchun": "Для офлайн-продаж",
  "Mahsulot haqida izoh va tavsif:": "Описание и примечание о товаре:",
  "Mahsulot sifati, qo‘llanilishi va afzalliklari haqida qisqacha ma’lumot...": "Краткая информация о качестве, применении и преимуществах товара...",
  "Mahsulot haqida rasmli tavsif:": "Описание товара в картинках:",
  "SMS Tasdiqlash:": "SMS-подтверждение:",
  "SMS yuboriladigan kabinet telefon raqami:": "Номер телефона кабинета для отправки SMS:",
  "Asosiy raqam": "Основной номер",
  "Qo‘shimcha raqam": "Доп. номер",
  "Bunkerga chiqarish": "Опубликовать в Bunker",
  "Tasdiqlash va Bunkerga chiqarish": "Подтвердить и опубликовать в Bunker",
  "Parol bilan tasdiqlash:": "Подтверждение паролем:",
  "Mahsulotni Bunkerga chiqarish uchun kabinet parolini kiriting:": "Введите пароль кабинета для публикации товара в Bunker:",
  "Kabinet parolini kiriting...": "Введите пароль кабинета...",
  "Saqlash (Oflayn mahsulot)": "Сохранить (Офлайн товар)",
  "O‘zgarishlarni Saqlash": "Сохранить изменения",

  // Bunker Admin Cabinet
  "Kabinetni O‘chirish": "Удаление кабинета",
  "Bunker Admin paroli:": "Пароль Bunker Admin:",
  "Bunker Admin parolini kiriting": "Введите пароль Bunker Admin",
  "Tasdiqlash va O‘chirish": "Подтвердить и удалить",
  "Bunker Admin Sozlamalari": "Настройки Bunker Admin",
  "Bunker Admin Login va Paroli": "Логин и пароль Bunker Admin",
  "Logotipga Rasm Qo‘yish": "Установка логотипа",
  "Rasm yuklash": "Загрузить изображение",
  "Ijtimoiy Tarmoq Havolalari va Aloqa": "Ссылки на соцсети и контакты",
};

// Build normalized lookup table so straight and curly apostrophes always match
const NORMALIZED_DICTIONARY: Record<string, string> = {};
for (const [k, v] of Object.entries(EXACT_DICTIONARY)) {
  NORMALIZED_DICTIONARY[normalizeQuotes(k)] = v;
}

export function translateUzToRu(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return raw;

  if (EXACT_DICTIONARY[trimmed]) {
    return raw.replace(trimmed, EXACT_DICTIONARY[trimmed]);
  }

  const normTrimmed = normalizeQuotes(trimmed);
  if (NORMALIZED_DICTIONARY[normTrimmed]) {
    return raw.replace(trimmed, NORMALIZED_DICTIONARY[normTrimmed]);
  }

  let res = raw;

  // Strip/translate company legal form words in headers
  res = res.replace(/mas['‘’ʻʼ`]?uliyati\s+cheklangan\s+jamiyati/gi, '');
  res = res.replace(/mas['‘’ʻʼ`]?uliyati\s+cheklangan\s+jamiyat/gi, '');
  res = res.replace(/aksiyadorlik\s+jamiyati/gi, 'АО');
  res = res.replace(/oilaviy\s+korxonasi/gi, 'СП');
  res = res.replace(/xususiy\s+korxonasi/gi, 'ЧП');

  // Dynamic patterns — Products, Cart, CRM, Monitoring, B2B Requests, Modals
  res = res.replace(
    /Onlayn Bunker \((\d+)\s*ta\)\s*•\s*Oflayn mahsulotlar \((\d+)\s*ta\)/gi,
    'Онлайн Бункер ($1 шт.) • Офлайн товары ($2 шт.)'
  );
  res = res.replace(
    /Yangi Mahsulot Qo['‘’ʻʼ`]?shish \((Onlayn Bunker|Онлайн Bunker|Онлайн Бункер)\)/gi,
    'Добавить новый товар (Онлайн Бункер)'
  );
  res = res.replace(
    /Yangi Mahsulot Qo['‘’ʻʼ`]?shish \((Oflayn|Офлайн)\)/gi,
    'Добавить новый товар (Офлайн)'
  );
  res = res.replace(/Barcha kunlar \((\d+)\s*kun\)/gi, 'Все дни ($1 дн.)');
  res = res.replace(/Savdo Savatlari \((\d+)\s*ta\)/gi, 'Торговые корзины ($1 шт.)');
  res = res.replace(/Savat #(\d+)\s*ga yuklash/gi, 'В Корзину #$1');
  res = res.replace(/Savat #(\d+)/gi, 'Корзина #$1');
  res = res.replace(/Jami savatda:\s*(\d+)\s*xil mahsulot/gi, 'Всего в корзине: $1 видов товаров');
  res = res.replace(/Jami:\s*(\d+)\s*ta birlik tovar\s*\|\s*(\d+)\s*xil mahsulot/gi, 'Всего: $1 ед. товара | $2 видов товаров');
  res = res.replace(/Jami:\s*(\d+)\s*xil mahsulot/gi, 'Всего: $1 видов товаров');
  res = res.replace(/Mahsulot suratlari \((\d+)\s*ta\):/gi, 'Фотографии товара ($1 шт.):');
  res = res.replace(/1\s+(.+?)\s+uchun belgilangan narx/gi, 'Цена за 1 $1');
  res = res.replace(/1\s+(.+?)\s+uchun/gi, 'за 1 $1');
  res = res.replace(/(\d+)\s*xil mahsulot/gi, '$1 видов товаров');
  res = res.replace(/Mavjud mahsulotlar:\s*(\d+)\s*xil/gi, 'Доступно товаров: $1 вид.');
  res = res.replace(/Vaqtincha tugagan:\s*(\d+)\s*xil/gi, 'Нет в наличии: $1 вид.');
  res = res.replace(/(\d+)\s*xil/gi, '$1 вид.');
  res = res.replace(/Jami\s*(\d+)\s*ta savdo/gi, 'Всего $1 продаж');
  res = res.replace(/Kunlik Hisobot \((\d+)\s*ta savdo\)/gi, 'Дневной отчет ($1 продаж)');
  res = res.replace(/(\d+)\s*ta savdo/gi, '$1 продаж');
  res = res.replace(/Kunlik jami:/gi, 'Итого за день:');
  res = res.replace(/Bunker ulushi \((.+?)%\):/gi, 'Доля Bunker ($1%):');
  res = res.replace(/Bunker ulushi:/gi, 'Доля Bunker:');
  res = res.replace(/Korxona tushumi:/gi, 'Выручка компании:');
  res = res.replace(/Onlayn \((.+?)\)\s*\+\s*100% CRM/gi, 'Онлайн ($1) + 100% CRM');
  res = res.replace(/\+([\d\s,]+)\s*qarz/gi, '+$1 долг');
  res = res.replace(/(\d+)\s*ta yozuv \((\d+)\s*kun\)/gi, '$1 записей ($2 дн.)');
  res = res.replace(/\(Qarz to['‘’ʻʼ`]?lovi\)/gi, '(Оплата долга)');
  res = res.replace(/\(Qisman to['‘’ʻʼ`]?lov\s*—\s*Qarz:\s*(.+?)\)/gi, '(Частичная оплата — Долг: $1)');
  res = res.replace(/\(Qarz:\s*(.+?)\)/gi, '(Долг: $1)');
  res = res.replace(/CRM savdo/gi, 'Продажа CRM');
  res = res.replace(/Onlayn Bunker/gi, 'Онлайн Бункер');
  res = res.replace(/Oflayn mahsulotlar/gi, 'Офлайн товары');
  res = res.replace(/Omborda:\s*Cheklanmagan/gi, 'На складе: Неограниченно');
  res = res.replace(/Omborda:\s*(\d+)/gi, 'На складе: $1');
  res = res.replace(/Mavjud variantlar:\s*(\d+)/gi, 'Варианты: $1');
  res = res.replace(/Mavjud variantlar/gi, 'Варианты');
  res = res.replace(/Narxi \((.+?) uchun\)/gi, 'Цена (за $1)');
  res = res.replace(/Buyurtma miqdori \((.+?)\):/gi, 'Количество заказа ($1):');
  res = res.replace(/Yetkazib beruvchi manzili:/gi, 'Адрес поставщика:');
  res = res.replace(/Bunker Qidiruv filtri \((\d+)\)/gi, 'Фильтр поиска Bunker ($1)');
  res = res.replace(/(\d+)\s*ta faol/gi, '$1 актив.');
  res = res.replace(/Ta['‘’ʻʼ`]?mir kategoriyasi \((\d+)\s*ta\):/gi, 'Категория ремонта ($1):');
  res = res.replace(/(\d+)\s*\/\s*(\d+)\s*ta yuklandi/gi, 'Загружено $1 / $2');
  res = res.replace(/(\d+)\s*\/\s*(\d+)\s*ta/gi, '$1 / $2 шт.');
  res = res.replace(/Tavsif uchun rasm qo['‘’ʻʼ`]?shish \((\d+)\s*ta joy qoldi\)/gi, 'Добавить фото для описания (осталось $1 мест)');
  res = res.replace(/Tanlangan:/gi, 'Выбрано:');
  res = res.replace(/Asosiy raqamga \((.+?)\) SMS yuborish/gi, 'Отправить SMS на основной номер ($1)');
  res = res.replace(/Savdo Monitoringi/gi, 'Мониторинг продаж');
  res = res.replace(/Jami so['‘’ʻʼ`]?rovlar:\s*(\d+)\s*ta/gi, 'Всего запросов: $1 шт.');
  res = res.replace(/Всего запросов:\s*(\d+)\s*ta/gi, 'Всего запросов: $1 шт.');
  res = res.replace(/Jami so['‘’ʻʼ`]?rovlar:/gi, 'Всего запросов:');
  res = res.replace(/\b(\d+)\s*dona\b/gi, '$1 шт.');
  res = res.replace(/\b(\d+)\s*ta\b/gi, '$1 шт.');
  res = res.replace(/\b(\d+)\s*kun\b/gi, '$1 дн.');
  res = res.replace(/so['‘’ʻʼ`]?m/gi, 'сум');

  return res;
}

// WeakMaps to store original Uzbek values and last translated values so dynamic React updates are caught
const originalTextMap = new WeakMap<Text, string>();
const lastTranslatedTextMap = new WeakMap<Text, string>();
const originalPlaceholderMap = new WeakMap<Element, string>();
const lastTranslatedPlaceholderMap = new WeakMap<Element, string>();
const originalTitleMap = new WeakMap<Element, string>();
const lastTranslatedTitleMap = new WeakMap<Element, string>();
let isApplyingTranslation = false;

function translateDomSubtree(root: Node, lang: AppLanguage) {
  if (isApplyingTranslation) return;
  isApplyingTranslation = true;
  try {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let node: Node | null = walker.currentNode;
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const textNode = node as Text;
        const parentTag = textNode.parentElement?.tagName;
        if (parentTag !== 'SCRIPT' && parentTag !== 'STYLE' && parentTag !== 'TEXTAREA') {
          const currentVal = textNode.nodeValue || '';
          if (lang === 'ru' || lang === 'uz_cyrl') {
            // If node was never seen OR React mutated its text since our last translation, record fresh Uzbek base
            if (!originalTextMap.has(textNode) || currentVal !== lastTranslatedTextMap.get(textNode)) {
              originalTextMap.set(textNode, currentVal);
            }
            const baseUz = originalTextMap.get(textNode) || currentVal;
            const translated = lang === 'ru' ? translateUzToRu(baseUz) : translateUzToCyrl(baseUz);
            lastTranslatedTextMap.set(textNode, translated);
            if (translated !== currentVal) {
              textNode.nodeValue = translated;
            }
          } else {
            if (originalTextMap.has(textNode)) {
              const orig = originalTextMap.get(textNode)!;
              if (currentVal === lastTranslatedTextMap.get(textNode)) {
                textNode.nodeValue = orig;
              }
              originalTextMap.delete(textNode);
              lastTranslatedTextMap.delete(textNode);
            }
          }
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        if (el.hasAttribute('placeholder')) {
          const curPh = el.getAttribute('placeholder') || '';
          if (lang === 'ru' || lang === 'uz_cyrl') {
            if (!originalPlaceholderMap.has(el) || curPh !== lastTranslatedPlaceholderMap.get(el)) {
              originalPlaceholderMap.set(el, curPh);
            }
            const origPh = originalPlaceholderMap.get(el) || curPh;
            const trPh = lang === 'ru' ? translateUzToRu(origPh) : translateUzToCyrl(origPh);
            lastTranslatedPlaceholderMap.set(el, trPh);
            if (trPh !== curPh) {
              el.setAttribute('placeholder', trPh);
            }
          } else if (originalPlaceholderMap.has(el)) {
            if (curPh === lastTranslatedPlaceholderMap.get(el)) {
              el.setAttribute('placeholder', originalPlaceholderMap.get(el)!);
            }
            originalPlaceholderMap.delete(el);
            lastTranslatedPlaceholderMap.delete(el);
          }
        }
        if (el.hasAttribute('title')) {
          const curTitle = el.getAttribute('title') || '';
          if (lang === 'ru' || lang === 'uz_cyrl') {
            if (!originalTitleMap.has(el) || curTitle !== lastTranslatedTitleMap.get(el)) {
              originalTitleMap.set(el, curTitle);
            }
            const origTitle = originalTitleMap.get(el) || curTitle;
            const trTitle = lang === 'ru' ? translateUzToRu(origTitle) : translateUzToCyrl(origTitle);
            lastTranslatedTitleMap.set(el, trTitle);
            if (trTitle !== curTitle) {
              el.setAttribute('title', trTitle);
            }
          } else if (originalTitleMap.has(el)) {
            if (curTitle === lastTranslatedTitleMap.get(el)) {
              el.setAttribute('title', originalTitleMap.get(el)!);
            }
            originalTitleMap.delete(el);
            lastTranslatedTitleMap.delete(el);
          }
        }
      }
      node = walker.nextNode();
    }
  } finally {
    isApplyingTranslation = false;
  }
}

let observerInitialized = false;

export function initDomLanguageTranslator() {
  if (typeof window === 'undefined' || observerInitialized) return;
  observerInitialized = true;

  const runTranslate = () => {
    const lang = getAppLanguage();
    if (document.body) {
      translateDomSubtree(document.body, lang);
    }
  };

  window.addEventListener('bunkerstroy_lang_changed', runTranslate);

  const observer = new MutationObserver(() => {
    const lang = getAppLanguage();
    if ((lang === 'ru' || lang === 'uz_cyrl') && document.body && !isApplyingTranslation) {
      translateDomSubtree(document.body, lang);
    }
  });

  if (document.body) {
    runTranslate();
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }
}
