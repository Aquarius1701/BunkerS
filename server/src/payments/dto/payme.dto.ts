import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class PaymeAccountDto {
  @ApiPropertyOptional({
    description: 'Buyurtma identifikatori (UUID)',
    example: 'd3b07384-d113-4a12-8e68-0523e198b965',
  })
  @IsOptional()
  @IsString()
  order_id?: string;

  @ApiPropertyOptional({
    description: 'Buyurtma identifikatori (muqobil camelCase format)',
    example: 'd3b07384-d113-4a12-8e68-0523e198b965',
  })
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiPropertyOptional({
    description: 'Qo‘shimcha hisob ID parametri',
    example: 'd3b07384-d113-4a12-8e68-0523e198b965',
  })
  @IsOptional()
  @IsString()
  id?: string;
}

export class PaymeParamsDto {
  @ApiPropertyOptional({
    description: 'To‘lov miqdori (tiyinda, masalan 1 000 so‘m = 100 000 tiyin)',
    example: 50000000,
  })
  @IsOptional()
  @IsNumber()
  amount?: number;

  @ApiPropertyOptional({
    description: 'Hisob ma’lumotlari (account)',
    type: PaymeAccountDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PaymeAccountDto)
  account?: PaymeAccountDto;

  @ApiPropertyOptional({
    description: 'Payme tranzaksiya identifikatori',
    example: '60c72b2f539f7a000d6a2f77',
  })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiPropertyOptional({
    description: 'Vaqt tamg‘asi (millisekundlarda)',
    example: 1710000000000,
  })
  @IsOptional()
  @IsNumber()
  time?: number;

  @ApiPropertyOptional({
    description: 'Bekor qilish sababi kodi',
    example: 1,
  })
  @IsOptional()
  @IsNumber()
  reason?: number;

  @ApiPropertyOptional({
    description: 'Ko‘chirma boshlanish vaqti',
    example: 1710000000000,
  })
  @IsOptional()
  @IsNumber()
  from?: number;

  @ApiPropertyOptional({
    description: 'Ko‘chirma tugash vaqti',
    example: 1710086400000,
  })
  @IsOptional()
  @IsNumber()
  to?: number;
}

export class PaymeRpcDto {
  @ApiPropertyOptional({
    description: 'JSON-RPC versiyasi',
    example: '2.0',
    default: '2.0',
  })
  @IsOptional()
  @IsString()
  jsonrpc?: string = '2.0';

  @ApiProperty({
    description: 'JSON-RPC so‘rov identifikatori',
    example: 1,
  })
  @IsNotEmpty()
  id!: number | string;

  @ApiProperty({
    description: 'Payme JSON-RPC 2.0 metodi',
    example: 'CheckPerformTransaction',
    enum: [
      'CheckPerformTransaction',
      'CreateTransaction',
      'PerformTransaction',
      'CancelTransaction',
      'CheckTransaction',
      'GetStatement',
    ],
  })
  @IsString()
  @IsNotEmpty()
  method!: string;

  @ApiPropertyOptional({
    description: 'Metod parametrlari obyekti',
    type: PaymeParamsDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PaymeParamsDto)
  params?: PaymeParamsDto;
}
