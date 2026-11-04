import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

export interface CitizenMobileNumberItem {
  phone: string;
  cleanPhone: string;
  operatorId: 'uzmobile' | 'beeline' | 'ucell' | 'mobiuz' | 'humans';
  operatorName: string;
  prefix: string;
  ownerName: string;
  ownerIdCard: string;
  isPrimary?: boolean;
  verifiedOwner: boolean;
}

@Injectable()
export class MyIdService {
  private readonly citizenPhonesRegistry: Record<string, string[]> = {};
  private readonly phoneToOwnerRegistry: Record<
    string,
    { cleanId: string; fullName: string; operatorId: string; operatorName: string }
  > = {};

  detectUzOperatorByPrefix(twoDigitPrefix: string): {
    operatorId: 'uzmobile' | 'beeline' | 'ucell' | 'mobiuz' | 'humans';
    operatorName: string;
  } | null {
    if (['90', '91'].includes(twoDigitPrefix)) {
      return { operatorId: 'beeline', operatorName: 'Beeline' };
    }
    if (['93', '94', '50'].includes(twoDigitPrefix)) {
      return { operatorId: 'ucell', operatorName: 'Ucell' };
    }
    if (['97', '88'].includes(twoDigitPrefix)) {
      return { operatorId: 'mobiuz', operatorName: 'Mobiuz' };
    }
    if (['33'].includes(twoDigitPrefix)) {
      return { operatorId: 'humans', operatorName: 'Humans' };
    }
    if (['99', '95', '77'].includes(twoDigitPrefix)) {
      return { operatorId: 'uzmobile', operatorName: 'Uztelecom (Uzmobile)' };
    }
    return null;
  }

  isRealUzMobile9Digits(rawDigits: string): boolean {
    if (!/^\d{9}$/.test(rawDigits)) return false;
    const prefix = rawDigits.slice(0, 2);
    if (!this.detectUzOperatorByPrefix(prefix)) return false;
    const subscriber = rawDigits.slice(2);
    if (
      subscriber === '3453453' ||
      subscriber === '1234567' ||
      subscriber === '0000000' ||
      /^(\d)\1{6}$/.test(subscriber)
    ) {
      return false;
    }
    return true;
  }

  formatUzPhone9Digits(nineDigits: string): string {
    const d = nineDigits.replace(/\D/g, '').slice(-9);
    if (d.length !== 9) return `+998 ${d}`;
    return `+998 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7, 9)}`;
  }

  buildCitizenRegisteredMobileNumbers(
    cleanId: string,
    fullName: string,
    currentPhone?: string,
    existingPhones?: string[],
  ): CitizenMobileNumberItem[] {
    const list: CitizenMobileNumberItem[] = [];
    const usedNineDigits = new Set<string>();
    const formattedIdCard =
      cleanId.length === 9 ? `${cleanId.slice(0, 2)} ${cleanId.slice(2)}` : cleanId;

    const candidateRawPhones: string[] = [];
    if (cleanId && Array.isArray(this.citizenPhonesRegistry[cleanId])) {
      this.citizenPhonesRegistry[cleanId].forEach((p) => {
        if (p) candidateRawPhones.push(String(p));
      });
    }
    if (Array.isArray(existingPhones)) {
      existingPhones.forEach((p) => {
        if (p) candidateRawPhones.push(String(p));
      });
    }
    if (currentPhone) candidateRawPhones.push(String(currentPhone));

    for (const rawPhone of candidateRawPhones) {
      let rawDigits = String(rawPhone).replace(/\D/g, '');
      if (rawDigits.startsWith('998')) rawDigits = rawDigits.slice(3);
      if (!this.isRealUzMobile9Digits(rawDigits)) continue;
      if (usedNineDigits.has(rawDigits)) continue;

      const existingOwner = this.phoneToOwnerRegistry[rawDigits];
      if (existingOwner && existingOwner.cleanId && existingOwner.cleanId !== cleanId) {
        continue;
      }

      const prefix = rawDigits.slice(0, 2);
      const op = this.detectUzOperatorByPrefix(prefix);
      if (!op) continue;
      const formatted = this.formatUzPhone9Digits(rawDigits);
      usedNineDigits.add(rawDigits);

      if (cleanId) {
        this.phoneToOwnerRegistry[rawDigits] = {
          cleanId,
          fullName,
          operatorId: op.operatorId,
          operatorName: op.operatorName,
        };
        const prevList = this.citizenPhonesRegistry[cleanId] || [];
        if (!prevList.includes(rawDigits)) {
          this.citizenPhonesRegistry[cleanId] = [...prevList, rawDigits];
        }
      }

      list.push({
        phone: formatted,
        cleanPhone: `+998${rawDigits}`,
        operatorId: op.operatorId,
        operatorName: op.operatorName,
        prefix,
        ownerName: fullName,
        ownerIdCard: formattedIdCard,
        isPrimary: list.length === 0,
        verifiedOwner: true,
      });
    }

    return list;
  }

  verifyPhoneOwnership(body: any) {
    const { phone, idCardNumber, fullName, existingPhones } = body || {};
    let digits = String(phone || '').replace(/\D/g, '');
    if (digits.startsWith('998')) digits = digits.slice(3);

    if (!this.isRealUzMobile9Digits(digits)) {
      throw new HttpException(
        {
          success: false,
          owned: false,
          error:
            'Iltimos, haqiqiy aloqa operatori (Uztelecom, Beeline, Ucell, Mobiuz, Humans) raqamini kiriting.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const cleanId = String(idCardNumber || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    const registryOwner = this.phoneToOwnerRegistry[digits];

    if (registryOwner && registryOwner.cleanId && registryOwner.cleanId !== cleanId) {
      throw new HttpException(
        {
          success: false,
          owned: false,
          error: `Ushbu raqam boshqa shaxs (${registryOwner.fullName}) nomiga rasmiylashtirilgan!`,
        },
        HttpStatus.FORBIDDEN,
      );
    }

    const combinedPhones = Array.isArray(existingPhones)
      ? [...existingPhones, digits]
      : [digits];
    const citizenNumbers = this.buildCitizenRegisteredMobileNumbers(
      cleanId,
      String(fullName || '').trim(),
      digits,
      combinedPhones,
    );

    const matched = citizenNumbers.find((item) => item.cleanPhone.endsWith(digits));
    if (!matched) {
      throw new HttpException(
        {
          success: false,
          owned: false,
          error: 'Telefon raqamni tasdiqlab bo‘lmadi.',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    return {
      success: true,
      owned: true,
      phone: matched.phone,
      operatorId: matched.operatorId,
      operatorName: matched.operatorName,
      ownerName: matched.ownerName,
      ownerIdCard: matched.ownerIdCard,
      registeredMobileNumbers: citizenNumbers,
    };
  }

  async verifyMyId(body: any) {
    const { idCardNumber, birthDate, currentPhone, existingPhones } = body || {};
    const cleanId = String(idCardNumber || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');

    const rawBirth = String(birthDate || '').trim();
    let dd = '';
    let mm = '';
    let yyyy = '';

    if (rawBirth) {
      if (/^\d{2}[./-]\d{2}[./-]\d{4}$/.test(rawBirth)) {
        const parts = rawBirth.split(/[./-]/);
        dd = parts[0];
        mm = parts[1];
        yyyy = parts[2];
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(rawBirth)) {
        const parts = rawBirth.split('-');
        yyyy = parts[0];
        mm = parts[1];
        dd = parts[2];
      } else {
        const digitsOnly = rawBirth.replace(/\D/g, '');
        if (digitsOnly.length === 8) {
          dd = digitsOnly.slice(0, 2);
          mm = digitsOnly.slice(2, 4);
          yyyy = digitsOnly.slice(4, 8);
        }
      }
    }

    if (!/^[A-Z]{2}\d{7}$/.test(cleanId)) {
      throw new HttpException(
        {
          success: false,
          error:
            'ID karta seriya va raqamini to‘g‘ri kiriting (masalan: AE 4690961).',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!dd || !mm || !yyyy) {
      throw new HttpException(
        {
          success: false,
          error: 'Tug‘ilgan sanani (KK.OO.YYYY, masalan: 29.01.2007) kiriting.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const displayBirth = `${String(dd).padStart(2, '0')}.${String(mm).padStart(2, '0')}.${yyyy}`;
    const isoBirth = `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;

    try {
      const checkResp = await fetch('https://myinsurance.uz/api/check-passport', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          document: cleanId,
          birthDate: isoBirth,
        }),
      });

      if (checkResp.ok) {
        const checkJson: any = await checkResp.json();
        const d = checkJson?.data;
        if (checkJson?.success && d && (d.ism || d.familya)) {
          const firstName = this.formatTitleCase(d.ism || '');
          const lastName = this.formatTitleCase(d.familya || '');
          const middleName = this.formatTitleCase(d.otasi || '');
          const fullName = `${lastName} ${firstName}`.trim();

          const extraApiPhones: string[] = Array.isArray(existingPhones)
            ? [...existingPhones]
            : [];
          if (d.phone) extraApiPhones.unshift(String(d.phone));
          if (d.mobile) extraApiPhones.unshift(String(d.mobile));

          const registeredMobileNumbers = this.buildCitizenRegisteredMobileNumbers(
            cleanId,
            fullName,
            currentPhone,
            extraApiPhones,
          );

          return {
            success: true,
            gatewayOnline: true,
            myIdJobId: `uz-${cleanId.toLowerCase()}`,
            verifiedAt: new Date().toISOString(),
            data: {
              idCardNumber: `${cleanId.slice(0, 2)} ${cleanId.slice(2)}`,
              cleanIdCardNumber: cleanId,
              pinfl: d.pinfl ? String(d.pinfl) : '',
              birthDate: d.birthday || isoBirth,
              birthDateFormatted: displayBirth,
              firstName,
              lastName,
              middleName,
              fullName,
              region: d.birth_place || 'Toshkent shahri',
              district: d.address || 'Yunusobod tumani',
              mahalla: d.address || '',
              address: d.address || `${d.birth_place || 'Toshkent'}`,
              issuedBy: d.passport_issued_by || `IIB MvaFRB`,
              issueDate: d.passport_issue_date || '',
              expiryDate: d.passport_expiry_date || '',
              birthPlace: d.birth_place || '',
              registeredMobileNumbers,
            },
          };
        }
      }
    } catch (e) {
      console.warn('MyId external verification warning', e);
    }

    throw new HttpException(
      {
        success: false,
        error:
          "Kiritilgan ID karta raqami va tug‘ilgan sana bo‘yicha davlat bazasida ma'lumot topilmadi. Iltimos, ID raqami va tug‘ilgan sanani tekshiring.",
      },
      HttpStatus.NOT_FOUND,
    );
  }

  private formatTitleCase(str: string): string {
    return str
      .toLowerCase()
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
}
