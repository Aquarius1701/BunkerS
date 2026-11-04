import { Module } from '@nestjs/common';
import { MyIdController } from './myid.controller';
import { MyIdService } from './myid.service';

@Module({
  controllers: [MyIdController],
  providers: [MyIdService],
  exports: [MyIdService],
})
export class MyIdModule {}
