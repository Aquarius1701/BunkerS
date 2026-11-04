import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { defaultCompanyLookupService, CompanyLookupService } from '../../services/companyLookup/CompanyLookupService';
import { defaultEImzoService } from '../../services/eimzo/EImzoService';
import { RegisterMchjDto } from './dto/register-mchj.dto';
import { VerifyEImzoDto } from './dto/verify-eimzo.dto';

@Injectable()
export class CompanyService {
  constructor(private readonly prisma: PrismaService) {}

  getTestStirs() {
    return {
      active: [
        { inn: '201122334', name: '«BUNKER STROY INVEST» MChJ', director: 'Karimov Jasur Bahromovich', region: 'Toshkent shahri', district: 'Yunusobod tumani', status: 'Faol' },
        { inn: '305566778', name: '«TOSHKENT G\'ISHT SERVIS» MChJ', director: 'Xolmatov Dilshod Rustamovich', region: 'Toshkent viloyati', district: 'Yangiyo‘l tumani', status: 'Faol' },
        { inn: '123456789', name: '«SAMARQAND CEMENT INDUSTRY» QK MChJ', director: 'Mirzayev Ulug‘bek Shavkatovich', region: 'Samarqand viloyati', district: 'Pastdarg‘om tumani', status: 'Faol' },
        { inn: '987654321', name: '«VODIY LOGISTIKA TRANS» MChJ', director: 'Rahimov Alisher Baxtiyorovich', region: 'Farg‘ona viloyati', district: 'Qo‘qon shahri', status: 'Faol' },
        { inn: '200362124', name: '«QIZILQUMSEMENT SANOAT ZAVODI» MChJ', director: 'Nazarov Bekzod Ilhomovich', region: 'Navoiy viloyati', district: 'Navoiy shahri', status: 'Faol' },
        { inn: '200245189', name: '«OHANGARON SEMENT KOMBINATI» MChJ', director: 'Abdullayev Farrux Sobirovich', region: 'Toshkent viloyati', district: 'Ohangaron shahri', status: 'Faol' },
        { inn: '200154872', name: '«BEKOBOD METALL PROKAT ZAVODI» MChJ', director: 'Tursunov Sardor G‘ulomovich', region: 'Toshkent viloyati', district: 'Bekobod shahri', status: 'Faol' },
        { inn: '206123456', name: '«BUXORO GIPS VA QURUQ QORISHMALAR ZAVODI» XK MChJ', director: 'Jo‘rayev Anvar Mahmudovich', region: 'Buxoro viloyati', district: 'Kogon shahri', status: 'Faol' },
        { inn: '304556677', name: '«GRAND STROY SAVDO MARKAZI» MChJ', director: 'Yuldashev Sherzod Akmalovich', region: 'Toshkent shahri', district: 'Sergeli tumani', status: 'Faol' },
        { inn: '308221144', name: '«ANDIJON QURILISH SAVDO TA’MINOT» MChJ', director: 'Qodirov Azizbek O‘ktamovich', region: 'Andijon viloyati', district: 'Andijon shahri', status: 'Faol' },
      ],
      liquidated: [
        { inn: '209999999', name: '«ESKI QURILISH INVEST» MChJ', status: 'Tugatilgan (Likvidatsiya)' },
      ],
      suspended: [
        { inn: '208888888', name: '«TO‘XTATILGAN SERVIS TRANS» MChJ', status: 'Vaqtincha to‘xtatilgan' },
      ],
      apiError: [
        { inn: '200000000', name: 'Tashqi Soliq API xatosi simulyatsiyasi', status: 'Xato' },
      ],
    };
  }

  async lookupByStir(inn: string) {
    if (!CompanyLookupService.isValidStirFormat(inn)) {
      throw new BadRequestException('STIR formati noto‘g‘ri. STIR faqat 9 ta raqamdan iborat bo‘lishi shart (masalan: 201122334)');
    }

    const result = await defaultCompanyLookupService.lookupByStir(inn);

    if (!result.success || !result.data) {
      if (result.errorCode === 'NOT_FOUND') {
        throw new NotFoundException(result.error || 'Ushbu STIR bo‘yicha tashkilot topilmadi');
      }
      if (result.errorCode === 'UPSTREAM_ERROR') {
        throw new ServiceUnavailableException(result.error || 'Tashqi Soliq API xizmati bilan aloqa o‘rnatilmadi');
      }
      throw new BadRequestException(result.error || 'Tashkilot ma’lumotlarini olishda xatolik yuz berdi');
    }

    return {
      success: true,
      data: result.data,
      cached: Boolean(result.cached),
      cachedAt: result.cachedAt,
      message: result.cached
        ? 'Ma’lumotlar 24 soatlik keshdan tezkor olindi'
        : 'Ma’lumotlar davlat reyestridan muvaffaqiyatli olindi',
    };
  }

  async registerMchj(dto: RegisterMchjDto) {
    const cleanInn = dto.inn.trim();
    if (!CompanyLookupService.isValidStirFormat(cleanInn)) {
      throw new BadRequestException('STIR formati noto‘g‘ri. STIR aynan 9 ta raqamdan iborat bo‘lishi shart (masalan: 201122334)');
    }

    const cleanPhone = dto.phone.replace(/\D/g, '');
    if (cleanPhone.length < 9) {
      throw new BadRequestException('Telefon raqami noto‘g‘ri (+998 ... formatida bo‘lishi lozim)');
    }

    const lookupResult = await defaultCompanyLookupService.lookupByStir(cleanInn);
    if (!lookupResult.success || !lookupResult.data) {
      const errorMsg = lookupResult.error || 'Tashkilot ma’lumotlarini tekshirib bo‘lmadi. Kabinet faollashtirilmadi.';
      throw new BadRequestException(`Davlat reyestridan STIR tasdiqlanmadi: ${errorMsg}`);
    }

    const company = lookupResult.data;

    if (company.status === 'liquidated') {
      throw new UnprocessableEntityException(
        `«${company.companyName}» tashkiloti davlat reyestrida TUGATILGAN (Likvidatsiya qilingan) deb belgilangan. Faoliyati tugatilgan yuridik shaxslar uchun kabinet faollashtirilmaydi!`,
      );
    }

    if (company.status === 'suspended') {
      throw new UnprocessableEntityException(
        `«${company.companyName}» tashkilotining faoliyati vaqtincha to‘xtatilgan. Faoliyati tiklanmaguncha MChJ kabinetini faollashtirib bo‘lmaydi.`,
      );
    }

    let verificationStatus: 'pending' | 'verified' | 'rejected' = 'pending';
    let eimzoVerifiedAt: string | undefined = undefined;

    if (dto.eimzo && dto.eimzo.challengeId && dto.eimzo.signature) {
      const eimzoResult = defaultEImzoService.verifySignature({
        challengeId: dto.eimzo.challengeId,
        inn: company.inn,
        signature: dto.eimzo.signature,
        certificate: dto.eimzo.certificate,
      });

      if (eimzoResult.success && eimzoResult.status === 'verified') {
        verificationStatus = 'verified';
        eimzoVerifiedAt = eimzoResult.verifiedAt;
      } else {
        throw new UnprocessableEntityException(
          eimzoResult.message || 'E-IMZO tekshiruvi rad etildi (STIR mos kelmadi yoki imzo noto‘g‘ri).',
        );
      }
    }

    const formattedPhone = cleanPhone.startsWith('998') ? `+${cleanPhone}` : `+998${cleanPhone.slice(-9)}`;

    // Persist or update user in database
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ inn: company.inn }, { phone: formattedPhone }],
      },
    });

    if (existingUser) {
      // Prevent account hijacking: do not overwrite admin accounts or conflicting accounts
      if (
        existingUser.role === 'admin' ||
        existingUser.role === 'bunker_admin' ||
        existingUser.role === 'sub_admin'
      ) {
        throw new BadRequestException(
          'Ushbu telefon raqam ma’muriy akkauntga tegishli. MChJ sifatida biriktirib bo‘lmaydi.',
        );
      }
      if (existingUser.inn && existingUser.inn !== company.inn) {
        throw new BadRequestException(
          'Ushbu telefon raqam boshqa STIR raqamli korxonaga tegishli.',
        );
      }
    }

    let user;
    if (existingUser) {
      user = await this.prisma.user.update({
        where: { id: existingUser.id },
        data: {
          displayName: company.companyName,
          phone: formattedPhone,
          companyName: company.companyName,
          verificationStatus,
          region: dto.region || company.region || undefined,
          district: dto.district || company.district || undefined,
          mahalla: dto.mahalla || undefined,
          eimzoVerifiedAt: eimzoVerifiedAt ? new Date(eimzoVerifiedAt) : undefined,
        },
      });
    } else {
      user = await this.prisma.user.create({
        data: {
          displayName: company.companyName,
          phone: formattedPhone,
          inn: company.inn,
          companyName: company.companyName,
          role: 'legal',
          userType: 'legal',
          cabinetType: 'partner',
          verificationStatus,
          region: dto.region || company.region || null,
          district: dto.district || company.district || null,
          mahalla: dto.mahalla || null,
          address: company.address || null,
          eimzoVerifiedAt: eimzoVerifiedAt ? new Date(eimzoVerifiedAt) : null,
        },
      });
    }

    return {
      success: true,
      cabinetActivated: true,
      verificationStatus,
      message:
        verificationStatus === 'verified'
          ? `«${company.companyName}» MChJ kabineti E-IMZO orqali tasdiqlandi va muvaffaqiyatli faollashtirildi!`
          : `«${company.companyName}» MChJ kabineti ro‘yxatdan o‘tkazildi. E-IMZO tasdiqlanishi: ${verificationStatus}.`,
      company,
      user: {
        id: user.id,
        inn: company.inn,
        companyName: company.companyName,
        director: company.director,
        role: 'legal',
        phone: formattedPhone,
        verificationStatus,
        eimzoVerifiedAt,
        region: user.region,
        district: user.district,
        mahalla: user.mahalla,
      },
    };
  }

  async verifyEImzo(dto: VerifyEImzoDto) {
    if (!CompanyLookupService.isValidStirFormat(dto.inn)) {
      throw new BadRequestException('STIR formati noto‘g‘ri (aynan 9 ta raqam bo‘lishi kerak)');
    }

    const result = defaultEImzoService.verifySignature({
      challengeId: dto.challengeId,
      inn: dto.inn,
      signature: dto.signature,
      certificate: dto.certificate,
    });

    if (result.status !== 'verified') {
      throw new UnprocessableEntityException(result.message || 'E-IMZO tekshiruvi muvaffaqiyatsiz bo‘ldi');
    }

    return result;
  }
}
