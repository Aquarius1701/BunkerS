import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { PaymentsModule } from './payments/payments.module';
import { ProductsModule } from './products/products.module';
import { OrdersModule } from './orders/orders.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { CrmModule } from './crm/crm.module';
import { LogisticsModule } from './logistics/logistics.module';
import { CompanyModule } from './company/company.module';
import { SmsModule } from './sms/sms.module';
import { SecurityModule } from './security/security.module';
import { MyIdModule } from './myid/myid.module';
import { AiModule } from './ai/ai.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    HealthModule,
    SmsModule,
    SecurityModule,
    AuthModule,
    PaymentsModule,
    ProductsModule,
    OrdersModule,
    SuppliersModule,
    CrmModule,
    LogisticsModule,
    CompanyModule,
    MyIdModule,
    AiModule,
  ],
})
export class AppModule {}
