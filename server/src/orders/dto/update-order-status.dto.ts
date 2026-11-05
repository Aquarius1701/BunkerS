import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateOrderStatusDto {
  @ApiProperty({
    description: 'Buyurtma holati',
    enum: ['pending', 'confirmed', 'preparing', 'ready', 'assigned', 'in_transit', 'delivered', 'cancelled'],
    example: 'in_transit',
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(['pending', 'confirmed', 'preparing', 'ready', 'assigned', 'in_transit', 'delivered', 'cancelled'], {
    message: 'Holat quyidagilardan biri bo‘lishi kerak: pending, confirmed, preparing, ready, assigned, in_transit, delivered, cancelled',
  })
  status!: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'assigned' | 'in_transit' | 'delivered' | 'cancelled';

  @ApiPropertyOptional({ description: 'Haydovchi F.I.Sh.', example: 'Sobirov Elyor' })
  @IsOptional()
  @IsString()
  driverName?: string;

  @ApiPropertyOptional({ description: 'Haydovchi telefon raqami', example: '+998901112233' })
  @IsOptional()
  @IsString()
  driverPhone?: string;
}
