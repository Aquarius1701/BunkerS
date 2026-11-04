import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateOrderItemDto {
  @ApiPropertyOptional({ description: 'Mahsulot ID (agar katalogdan bo‘lsa)', example: 'prod-123' })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiProperty({ description: 'Mahsulot nomi', example: 'G‘isht pishiq (Qo‘qon)' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ description: 'Miqdori', example: 1000 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({ description: 'O‘lchov birligi', default: 'dona', example: 'dona' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiProperty({ description: 'Birlik narxi (so‘m)', example: 1200 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price!: number;

  @ApiPropertyOptional({ description: 'Kategoriya', example: 'G‘isht va bloklar' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Yetkazib beruvchi ID', example: 'sup-456' })
  @IsOptional()
  @IsString()
  supplierId?: string;

  @ApiPropertyOptional({ description: 'Yetkazib beruvchi STIR', example: '305566778' })
  @IsOptional()
  @IsString()
  supplierInn?: string;

  @ApiPropertyOptional({ description: 'Yetkazib beruvchi nomi', example: 'Toshkent G‘isht Servis' })
  @IsOptional()
  @IsString()
  supplierName?: string;
}

export class CreateOrderDto {
  @ApiPropertyOptional({ description: 'Mijoz ID (agar tizimda mavjud bo‘lsa)', example: 'usr-123' })
  @IsOptional()
  @IsString()
  buyerId?: string;

  @ApiProperty({ description: 'Xaridor F.I.Sh.', example: 'Alisher Rahimov' })
  @IsString()
  @IsNotEmpty()
  buyerName!: string;

  @ApiProperty({ description: 'Xaridor telefon raqami', example: '+998901234567' })
  @IsString()
  @IsNotEmpty()
  buyerPhone!: string;

  @ApiProperty({ description: 'Yetkazib berish manzili', example: 'Chilonzor 9-mavze, 12-uy' })
  @IsString()
  @IsNotEmpty()
  deliveryAddress!: string;

  @ApiPropertyOptional({ description: 'Yetkazish viloyati', example: 'Toshkent shahri' })
  @IsOptional()
  @IsString()
  deliveryRegion?: string;

  @ApiPropertyOptional({ description: 'Yetkazish tumani', example: 'Chilonzor tumani' })
  @IsOptional()
  @IsString()
  deliveryDistrict?: string;

  @ApiPropertyOptional({ description: 'Ko‘cha / Mahalla', example: 'Bunyodkor shoh ko‘chasi' })
  @IsOptional()
  @IsString()
  deliveryStreet?: string;

  @ApiPropertyOptional({ description: 'Mo‘ljal', example: 'Mirzo Ulug‘bek metro yaqinida' })
  @IsOptional()
  @IsString()
  deliveryLandmark?: string;

  @ApiPropertyOptional({ description: 'Qabul qiluvchi ismi', example: 'Jasur Karimov' })
  @IsOptional()
  @IsString()
  recipientName?: string;

  @ApiPropertyOptional({ description: 'Qabul qiluvchi telefoni', example: '+998939876543' })
  @IsOptional()
  @IsString()
  recipientPhone?: string;

  @ApiPropertyOptional({
    description: 'To‘lov usuli (escrow | click | payme | cash)',
    default: 'escrow',
    example: 'escrow',
  })
  @IsOptional()
  @IsString()
  @IsIn(['escrow', 'click', 'payme', 'cash'])
  paymentMethod?: string;

  @ApiPropertyOptional({
    description: 'Eskrou to‘lov sxemasi (split_50_50 | full_100)',
    default: 'split_50_50',
    example: 'split_50_50',
  })
  @IsOptional()
  @IsString()
  @IsIn(['split_50_50', 'full_100'])
  escrowMode?: string;

  @ApiPropertyOptional({
    description: 'Yuk mashinasi turi (samosval, mikser, kran_manipulyator, gazel, fura)',
    default: 'samosval',
    example: 'samosval',
  })
  @IsOptional()
  @IsString()
  @IsIn(['samosval', 'mikser', 'kran_manipulyator', 'gazel', 'fura'])
  vehicleType?: string;

  @ApiPropertyOptional({
    description: 'Buyurtma kanali (online | offline)',
    default: 'online',
    example: 'online',
  })
  @IsOptional()
  @IsString()
  @IsIn(['online', 'offline'])
  orderChannel?: string;

  @ApiProperty({
    description: 'Buyurtma qilingan mahsulotlar ro‘yxati',
    type: [CreateOrderItemDto],
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'Buyurtmada kamida bitta mahsulot bo‘lishi shart' })
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];
}
