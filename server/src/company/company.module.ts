import { Module } from '@nestjs/common';
import { CompanyController } from './company.controller';
import { EImzoController } from './eimzo.controller';
import { CompanyService } from './company.service';

@Module({
  controllers: [CompanyController, EImzoController],
  providers: [CompanyService],
  exports: [CompanyService],
})
export class CompanyModule {}
